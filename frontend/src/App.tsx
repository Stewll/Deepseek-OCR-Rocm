import React, { useState, useRef, useEffect } from "react";
import DOMPurify from 'dompurify';
import './App.css';
import { API_BASE_URL, __DEV__, ENABLE_WEBCAM, ENABLE_FILE_UPLOAD } from './config';

interface TextRegion {
  text: string;
  bbox: [number, number, number, number]; // [x1, y1, x2, y2]
}

// Reusable Button component
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant: 'primary' | 'success' | 'secondary' | 'info' | 'danger' | 'disabled';
  size?: 'small' | 'medium';
}

const Button: React.FC<ButtonProps> = ({ variant, size = 'small', children, ...props }) => {
  const className = `btn btn-${size} btn-${variant}`;
  return (
    <button
      className={className}
      {...props}
    >
      {children}
    </button>
  );
};

// Utility functions
const cleanupOverlayImage = (overlayImageUrl: string | null, setOverlayImageUrl: (url: string | null) => void) => {
  if (overlayImageUrl) {
    URL.revokeObjectURL(overlayImageUrl);
    setOverlayImageUrl(null);
  }
};

const resetOcrState = (
  setOcrResult: (result: string) => void,
  setTextRegions: (regions: TextRegion[]) => void,
  overlayImageUrl: string | null,
  setOverlayImageUrl: (url: string | null) => void
) => {
  setOcrResult("");
  setTextRegions([]);
  cleanupOverlayImage(overlayImageUrl, setOverlayImageUrl);
};

const sanitizeOcrResult = (text: string, format: "text" | "markdown"): string => {
  if (format === "markdown") {
    // For markdown, sanitize any HTML content that might be present
    return DOMPurify.sanitize(text, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
  } else {
    // For plain text, escape HTML entities to prevent XSS
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#x27;")
      .replace(/\//g, "&#x2F;");
  }
};

const getCameraErrorMessage = (error: any): string => {
  let errorMessage = 'Error accessing webcam. ';
  
  if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
    errorMessage += 'Camera permission was denied. Please allow camera access and try again.';
  } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
    errorMessage += 'No camera found on your device.';
  } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
    errorMessage += 'Camera is already in use by another application.';
  } else if (error.name === 'OverconstrainedError' || error.name === 'ConstraintNotSatisfiedError') {
    errorMessage += 'Camera constraints could not be satisfied.';
  } else if (error.name === 'NotSupportedError') {
    errorMessage += 'Camera access is not supported in this browser.';
  } else if (error.name === 'AbortError') {
    errorMessage += 'Camera access was aborted.';
  } else {
    errorMessage += 'Unknown error occurred. Please check your browser settings and try again.';
  }
  
  return errorMessage;
};

const App: React.FC = () => {
  // Development logging
  useEffect(() => {
    if (__DEV__) {
      console.log('🔧 Development mode enabled');
      console.log('📋 Configuration:', {
        API_BASE_URL,
        ENABLE_WEBCAM,
        ENABLE_FILE_UPLOAD,
        APP_VERSION: import.meta.env.VITE_APP_VERSION
      });
    }
  }, []);

  // File and Image State
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imageSize, setImageSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const imageRef = useRef<HTMLImageElement>(null);
  const [overlayImageUrl, setOverlayImageUrl] = useState<string | null>(null);
  
  // OCR Processing State
  const [ocrResult, setOcrResult] = useState<string>("");
  const [textRegions, setTextRegions] = useState<TextRegion[]>([]);
  const [outputFormat, setOutputFormat] = useState<"text" | "markdown">("text");
  const [isLoading, setIsLoading] = useState(false);
  
  // Webcam State
  const [showWebcam, setShowWebcam] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cameraAvailable, setCameraAvailable] = useState<boolean | null>(null);

  // Effects
  // Check camera availability on component mount
  useEffect(() => {
    const checkCameraAvailability = async () => {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          setCameraAvailable(false);
          return;
        }
        
        const devices = await navigator.mediaDevices.enumerateDevices();
        const hasCamera = devices.some(device => device.kind === 'videoinput');
        setCameraAvailable(hasCamera);
      } catch (error) {
        console.warn('Could not check camera availability:', error);
        setCameraAvailable(false);
      }
    };
    
    checkCameraAvailability();
  }, []);

  // Cleanup webcam stream on component unmount
  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach((track: MediaStreamTrack) => track.stop());
      }
    };
  }, [stream]);

  // Cleanup overlay URL on component unmount
  useEffect(() => {
    return () => {
      if (overlayImageUrl) {
        URL.revokeObjectURL(overlayImageUrl);
      }
    };
  }, [overlayImageUrl]); // Watch overlayImageUrl changes for cleanup

  // File and Image Handlers
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      resetOcrState(setOcrResult, setTextRegions, overlayImageUrl, setOverlayImageUrl);
    }
  };

  const handleImageLoad = () => {
    if (imageRef.current) {
      setImageSize({
        width: imageRef.current.naturalWidth,
        height: imageRef.current.naturalHeight
      });
    }
  };

  const createOverlayImage = async () => {
    if (!selectedFile || !textRegions.length || !imageRef.current) return;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size to match original image
    canvas.width = imageSize.width;
    canvas.height = imageSize.height;

    // Create a new image element to draw the original image
    const img = new Image();
    
    return new Promise<string>((resolve) => {
      img.onload = () => {
        // Draw the original image
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        // Draw overlay rectangles and text
        textRegions.forEach((region: TextRegion, index: number) => {
          const [x1, y1, x2, y2] = region.bbox;
          
          // Draw semi-transparent yellow background
          ctx.fillStyle = 'rgba(255, 255, 0, 0.3)';
          ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
          
          // Draw orange border
          ctx.strokeStyle = '#ff6b35';
          ctx.lineWidth = 3;
          ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
          
          // Draw text label with background
          const fontSize = Math.max(12, Math.min(16, (y2 - y1) / 3));
          ctx.font = `${fontSize}px Arial, sans-serif`;
          ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
          
          const textMetrics = ctx.measureText(`${index + 1}`);
          const textWidth = textMetrics.width;
          const textHeight = fontSize;
          
          // Draw text background
          ctx.fillRect(x1, y1 - textHeight - 4, textWidth + 8, textHeight + 4);
          
          // Draw text number
          ctx.fillStyle = 'white';
          ctx.fillText(`${index + 1}`, x1 + 4, y1 - 4);
        });

        // Convert canvas to blob URL
        canvas.toBlob((blob: Blob | null) => {
          if (blob) {
            const url = URL.createObjectURL(blob);
            setOverlayImageUrl(url);
            resolve(url);
          }
        }, 'image/jpeg', 0.9);
      };
      
      img.src = URL.createObjectURL(selectedFile);
    });
  };

  const downloadOverlayImage = () => {
    if (overlayImageUrl) {
      const link = document.createElement('a');
      link.href = overlayImageUrl;
      link.download = `ocr-overlay-${selectedFile?.name || 'image'}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  // OCR Handlers
  const parseOCRResult = (text: string): TextRegion[] => {
    const regions: TextRegion[] = [];
    
    // Split by text references
    const textBlocks = text.split('<|ref|>text<|/ref|>').filter(block => block.trim());
    
    for (const block of textBlocks) {
      // Extract detection coordinates
      const detMatch = block.match(/<\|det\|>\[\[(\d+),\s*(\d+),\s*(\d+),\s*(\d+)\]\]<\|\/det\|>/);
      if (detMatch) {
        const bbox: [number, number, number, number] = [
          parseInt(detMatch[1]),
          parseInt(detMatch[2]),
          parseInt(detMatch[3]),
          parseInt(detMatch[4])
        ];
        
        // Extract the text content (everything after the detection tag)
        const textContent = block.split('<|/det|>')[1]?.trim();
        if (textContent) {
          regions.push({
            text: textContent,
            bbox: bbox
          });
        }
      }
    }
    
    return regions;
  };

  const handleOCR = async () => {
    if (!selectedFile) return;

    setIsLoading(true);
    try {
      // Create FormData for file upload
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("output_format", outputFormat);
      
      const response = await fetch(`${API_BASE_URL}/ocr`, {
        method: "POST",
        body: formData
      });

      const data = await response.json();
      
      if (data.success) {
        setOcrResult(data.text);
        // Parse the OCR result to extract text regions and bounding boxes
        const regions = parseOCRResult(data.text);
        setTextRegions(regions);
        
        // Clear any previous overlay image
        cleanupOverlayImage(overlayImageUrl, setOverlayImageUrl);
      } else {
        setOcrResult(`Error: ${data.error || "Failed to process image"}`);
        setTextRegions([]);
        cleanupOverlayImage(overlayImageUrl, setOverlayImageUrl);
      }
    } catch (error) {
      console.error("OCR Error:", error);
      setOcrResult("Error: Failed to connect to OCR service");
      setTextRegions([]);
      cleanupOverlayImage(overlayImageUrl, setOverlayImageUrl);
    } finally {
      setIsLoading(false);
    }
  };

  // Webcam Handlers
  const startWebcam = async () => {
    try {
      // Check if getUserMedia is supported
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert('Camera access is not supported in this browser. Please use a modern browser like Chrome, Firefox, or Safari.');
        return;
      }

      // Try with environment camera first (back camera on mobile)
      let mediaStream;
      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({ 
          video: { 
            width: { ideal: 1280, max: 1920 },
            height: { ideal: 720, max: 1080 },
            facingMode: 'environment' // Use back camera on mobile if available
          } 
        });
      } catch (envError) {
        console.log('Environment camera not available, trying default camera...');
        // Fallback to any available camera
        try {
          mediaStream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
              width: { ideal: 1280, max: 1920 },
              height: { ideal: 720, max: 1080 }
            } 
          });
        } catch (defaultError) {
          // Final fallback with basic video constraints
          mediaStream = await navigator.mediaDevices.getUserMedia({ video: true });
        }
      }

      setStream(mediaStream);
      setShowWebcam(true);
      
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (error: any) {
      console.error('Error accessing webcam:', error);
      
      const errorMessage = getCameraErrorMessage(error);
      alert(errorMessage);
    }
  };

  const stopWebcam = () => {
    if (stream) {
      stream.getTracks().forEach((track: MediaStreamTrack) => track.stop());
      setStream(null);
    }
    setShowWebcam(false);
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      
      if (context) {
        // Set canvas dimensions to match video
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        
        // Draw the video frame to canvas
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        // Convert canvas to blob and create a file
        canvas.toBlob((blob: Blob | null) => {
          if (blob) {
            const file = new File([blob], 'webcam-photo.jpg', { type: 'image/jpeg' });
            setSelectedFile(file);
            resetOcrState(setOcrResult, setTextRegions, overlayImageUrl, setOverlayImageUrl);
            
            stopWebcam();
          }
        }, 'image/jpeg', 0.9);
      }
    }
  };

  // Webcam Handlers

  return (
    <div className="app-container">
      <h1>DeepSeek OCR UI</h1>

      {/* Development info */}
      {__DEV__ && (
        <div className="margin-bottom-20" style={{ 
          backgroundColor: '#f0f8ff', 
          border: '1px solid #add8e6', 
          borderRadius: '4px', 
          padding: '10px',
          fontSize: '12px'
        }}>
          <strong>🔧 Development Mode</strong>
          <br />
          API: {API_BASE_URL} | Webcam: {ENABLE_WEBCAM ? '✅' : '❌'} | Upload: {ENABLE_FILE_UPLOAD ? '✅' : '❌'}
        </div>
      )}

      <div className="margin-bottom-20">
        <label htmlFor="file">Select Image:</label>
        {ENABLE_FILE_UPLOAD ? (
          <input
            id="file"
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            className="file-input"
          />
        ) : (
          <div className="text-small text-muted">File upload disabled</div>
        )}
        <div className="margin-top-10">
          <span className="margin-right-10 text-small">Or</span>
          {cameraAvailable === null ? (
            <span className="text-small">Checking camera...</span>
          ) : cameraAvailable && ENABLE_WEBCAM ? (
            <Button
              onClick={showWebcam ? stopWebcam : startWebcam}
              variant={showWebcam ? 'danger' : 'info'}
              size="medium"
            >
              {showWebcam ? "Cancel Camera" : "📷 Take Photo"}
            </Button>
          ) : (
            <div className="text-small">
              {ENABLE_WEBCAM ? 'Camera not available' : 'Camera feature disabled'}
              {ENABLE_WEBCAM && (
                <>
                  <br />
                  <details className="margin-top-5">
                    <summary className="cursor-pointer text-tiny">
                      Troubleshooting tips
                    </summary>
                    <div className="margin-top-5 text-tiny line-height-1-4">
                      • Make sure you're using HTTPS (not HTTP)<br />
                      • Check that your device has a camera<br />
                      • Allow camera permission when prompted<br />
                      • Try refreshing the page<br />
                      • Make sure no other app is using the camera<br />
                      • Try a different browser (Chrome, Firefox, Safari)
                    </div>
                  </details>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Webcam section */}
      {showWebcam && (
        <div className="margin-bottom-20">
          <h3>Camera:</h3>
          <div className="image-preview">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              className="video-preview"
            />
            <div className="margin-top-10 text-center">
              <Button
                onClick={capturePhoto}
                variant="success"
                size="medium"
              >
                📸 Capture Photo
              </Button>
              <Button
                onClick={stopWebcam}
                variant="secondary"
                size="medium"
              >
                Cancel
              </Button>
            </div>
          </div>
          <canvas ref={canvasRef} className="canvas-hidden" />
        </div>
      )}

      <div className="margin-bottom-20">
        <label htmlFor="output-format">Output Format:</label>
        <select
          id="output-format"
          value={outputFormat}
          onChange={(e) => setOutputFormat(e.target.value as "text" | "markdown")}
          className="select-input"
        >
          <option value="text">Plain Text (Free OCR)</option>
          <option value="markdown">Markdown Format</option>
        </select>
      </div>

      {selectedFile && (
        <div className="margin-bottom-20">
          <h3>Preview: {selectedFile.name === 'webcam-photo.jpg' ? 'Captured Photo' : 'Uploaded Image'}</h3>
          <div className="image-preview">
            <img
              ref={imageRef}
              src={URL.createObjectURL(selectedFile)}
              alt="Selected"
              onLoad={handleImageLoad}
              className="preview-image"
            />
          </div>
          
          {textRegions.length > 0 && (
            <div className="margin-top-10">
              <Button
                onClick={createOverlayImage}
                disabled={!!overlayImageUrl}
                variant={overlayImageUrl ? 'success' : 'primary'}
              >
                {overlayImageUrl ? "✓ Overlay Created" : "Create Text Overlay"}
              </Button>
              
              {overlayImageUrl && (
                <Button
                  onClick={downloadOverlayImage}
                  variant="info"
                >
                  📥 Download Overlay
                </Button>
              )}
              
              <div className="margin-top-5">
                <span className="text-small">
                  {textRegions.length} text region{textRegions.length !== 1 ? "s" : ""} detected
                </span>
              </div>
            </div>
          )}
          
          {/* Show overlay image when created */}
          {overlayImageUrl && (
            <div className="margin-top-20">
              <h4>Image with Text Overlay:</h4>
              <img
                src={overlayImageUrl}
                alt="Image with text overlay"
                className="overlay-image"
              />
            </div>
          )}
        </div>
      )}

      <Button
        onClick={handleOCR}
        disabled={!selectedFile || isLoading}
        variant={selectedFile && !isLoading ? 'primary' : 'disabled'}
        size="medium"
      >
        {isLoading ? "Processing..." : "Extract Text"}
      </Button>

      {ocrResult && (
        <div className="margin-top-20">
          <h3>Extracted Text:</h3>
          <div className="ocr-result">
            {sanitizeOcrResult(ocrResult, outputFormat)}
          </div>
        </div>
      )}
    </div>
  );
};

export default App;