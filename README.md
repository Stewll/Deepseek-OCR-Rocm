# DeepSeek OCR Application

A containerized OCR application using DeepSeek-OCR model with vLLM and a React frontend.

## Architecture

- **Frontend**: React TypeScript application with Vite
- **OCR Service**: FastAPI application using vLLM with DeepSeek-OCR model
- **Reverse Proxy**: Nginx for routing and load balancing
- **Container Runtime**: Docker Compose for orchestration

## Features

- **File Upload**: Direct image upload to OCR service
- **Dual Output Formats**:
  - Plain Text: Basic OCR text extraction
  - Markdown: Structured document conversion with formatting
- **ROCm Support**: Optimized for AMD GPUs
- **Responsive UI**: Clean, modern interface



## Download Model Files
# Make sure git-lfs is installed (https://git-lfs.com)
git lfs install
# Clone the DeepSeek-OCR model repository (approx 7 GB) 
# Default path is set in .env as MODEL_HOST_PATH 
git clone https://huggingface.co/DeepSeek/DeepSeek-OCR ./models

## API Endpoints

### OCR Processing
- `POST /api/ocr` - Upload image file for OCR processing
  - Form data with `file` (image) and `output_format` ("text" or "markdown")
- `POST /api/ocr-base64` - Process base64 encoded image
- `GET /api/health` - Health check endpoint


## Usage

1. **Start the application**:
   ```bash
   docker-compose up -d
   ```

2. **Access the web interface**:
   - Open http://localhost:8080 in your browser

3. **Upload an image**:
   - Select an image file
   - Choose output format (Text or Markdown)
   - Click "Extract Text"

## Configuration

### Configuration & .env (recommended)

Configuration is sourced from a `.env` file at the project root which is read by `docker-compose`.
Copy the example file and update values for your environment:

```bash
cp .env.example .env
# edit .env and set MODEL_HOST_PATH to the host model directory
```

Key environment variables (see `.env.example` for full list):

- `MODEL_HOST_PATH` — absolute path on the host machine where the DeepSeek-OCR model lives.
- `MODEL_CONTAINER_PATH` — path inside the container where the model will be mounted (for example `/models/DeepSeek-OCR`).
- `MODEL_PATH` — inside the container, `MODEL_PATH` will be set to `MODEL_CONTAINER_PATH` so the application reads the container path (not the host path).
- `PORT` / `HOST` — FastAPI host/port (defaults: `0.0.0.0:9000`).
- `HIP_VISIBLE_DEVICES` / `CUDA_VISIBLE_DEVICES` — GPU device selection.

Why host/container separation?

- The compose file maps `${MODEL_HOST_PATH}:${MODEL_CONTAINER_PATH}:ro` and sets `MODEL_PATH=${MODEL_CONTAINER_PATH}` inside the container.
- This prevents application code from needing to know or rely on host filesystem layout and makes the compose file portable.

### Model Requirements

- DeepSeek-OCR model files must exist at the `MODEL_HOST_PATH` on the host machine and be readable by Docker.
- ROCm-compatible AMD GPU
- Sufficient VRAM for model loading

## Development

### Frontend Development
```bash
cd frontend
npm install
npm run dev
```

### OCR Service Development
```bash
cd Vllm
pip install -r requirements.txt
python app.py
```

## Troubleshooting

- **Model loading errors**: Check model path and permissions
- **GPU access issues**: Verify ROCm installation and device permissions
- **Memory errors**: Reduce max_tokens or check available VRAM
- **Upload failures**: Check nginx client_max_body_size setting