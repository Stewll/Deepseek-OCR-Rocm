#!/usr/bin/env python3
"""
Dedicated DeepSeek-OCR FastAPI application using vLLM
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, field_validator
from typing import Optional, Literal
from PIL import Image
import uvicorn
import base64
from io import BytesIO

from vllm import LLM, SamplingParams
from vllm.model_executor.models.deepseek_ocr import NGramPerReqLogitsProcessor

from config import Config

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Global vLLM instance
llm: Optional[LLM] = None

class OCRRequest(BaseModel):
    model_config = ConfigDict(protected_namespaces=())  # Fix pydantic namespace warning
    
    image_base64: str
    output_format: Literal["text", "markdown"] = "text"

    @field_validator('image_base64')
    @classmethod
    def validate_base64(cls, v):
        import base64
        import binascii
        try:
            base64.b64decode(v, validate=True)
        except (binascii.Error, ValueError):
            raise ValueError('Invalid base64 string')
        return v

class OCRResponse(BaseModel):
    model_config = ConfigDict(protected_namespaces=())  # Fix pydantic namespace warning
    
    text: str
    format: str
    success: bool
    error: Optional[str] = None

def create_error_response(output_format: str, error: str) -> OCRResponse:
    """Create an error OCR response"""
    # Log the actual error for debugging but return sanitized message
    logger.error(f"OCR processing error: {error}")
    sanitized_error = "An error occurred during processing. Please try again."
    return OCRResponse(
        text="",
        format=output_format,
        success=False,
        error=sanitized_error
    )

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan event handler to replace deprecated on_event"""
    global llm

    try:
        logger.info(f"Loading DeepSeek-OCR model from: {Config.MODEL_PATH}")

        # Use the exact configuration from the official documentation
        llm = LLM(
            model=Config.MODEL_PATH,
            enable_prefix_caching=False,
            mm_processor_cache_gb=0,
            logits_processors=[NGramPerReqLogitsProcessor],
            trust_remote_code=True,
        )

        logger.info("Model loaded successfully!")

    except Exception as e:
        logger.error(f"Failed to load model: {e}")
        raise

    yield  # Application runs here

    # Cleanup on shutdown
    if llm:
        logger.info("Cleaning up model...")

app = FastAPI(
    title="DeepSeek OCR Service", 
    version="1.0.0",
    lifespan=lifespan
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify your frontend domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_prompt(output_format: str) -> str:
    """Get the appropriate prompt based on output format"""
    if output_format == "markdown":
        return "<image>\n<|grounding|>Convert the document to markdown."
    else:
        return "<image>\nFree OCR."

def process_image(image_data: bytes) -> Image.Image:
    """Process uploaded image data"""
    try:
        image = Image.open(BytesIO(image_data))
        # Convert to RGB if necessary
        if image.mode != "RGB":
            image = image.convert("RGB")
        return image
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid image format: {str(e)}")

def get_sampling_params() -> SamplingParams:
    """Get the sampling parameters for OCR processing"""
    return SamplingParams(
        temperature=0.0,
        max_tokens=4096,  # Conservative limit to avoid context overflow
        # ngram logit processor args from official docs
        extra_args=dict(
            ngram_size=30,
            window_size=90,
            whitelist_token_ids={128821, 128822},  # whitelist: <td>, </td>
        ),
        skip_special_tokens=False,
    )

def process_ocr_request(image: Image.Image, output_format: str) -> OCRResponse:
    """Process an OCR request with the given image and output format"""
    global llm
    
    if not llm:
        raise HTTPException(status_code=500, detail="Model not loaded")
    
    try:
        # Get appropriate prompt
        prompt = get_prompt(output_format)
        
        # Prepare input for vLLM
        model_input = [{
            "prompt": prompt,
            "multi_modal_data": {"image": image}
        }]
        
        # Configure sampling parameters
        sampling_params = get_sampling_params()
        
        # Generate OCR result
        logger.info(f"Processing OCR request with format: {output_format}")
        model_outputs = llm.generate(model_input, sampling_params)
        
        if not model_outputs or not model_outputs[0].outputs:
            raise HTTPException(status_code=500, detail="No output generated")
        
        extracted_text = model_outputs[0].outputs[0].text
        
        return OCRResponse(
            text=extracted_text,
            format=output_format,
            success=True
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"OCR processing error: {e}")
        return create_error_response(output_format, str(e))

@app.post("/ocr", response_model=OCRResponse)
async def perform_ocr(
    file: UploadFile = File(...),
    output_format: str = Form(default="text")
):
    """
    Perform OCR on uploaded image file
    """
    # Validate output_format
    if output_format not in ["text", "markdown"]:
        raise HTTPException(status_code=400, detail="Invalid output_format. Must be 'text' or 'markdown'")
    
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")
    
    try:
        # Read and process image
        image_data = await file.read()
        image = process_image(image_data)
        
        return process_ocr_request(image, output_format)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"OCR processing error: {e}")
        return create_error_response(output_format, str(e))

@app.post("/ocr-base64", response_model=OCRResponse)
async def perform_ocr_base64(request: OCRRequest):
    """
    Perform OCR on base64 encoded image
    """
    try:
        # Decode base64 image
        image_data = base64.b64decode(request.image_base64)
        image = process_image(image_data)
        
        return process_ocr_request(image, request.output_format)
        
    except Exception as e:
        logger.error(f"OCR processing error: {e}")
        return create_error_response(request.output_format, str(e))

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy" if llm else "unhealthy",
        "model_loaded": llm is not None
    }

if __name__ == "__main__":
    uvicorn.run(
        app,
        host=Config.HOST,
        port=Config.PORT,
        log_level="info"
    )