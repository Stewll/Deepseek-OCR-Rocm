# DeepSeek OCR Application

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE) [![Docker](https://img.shields.io/badge/docker-ready-brightgreen.svg)](https://www.docker.com) [![Model size](https://img.shields.io/badge/model--size-~7GB-orange.svg)](https://huggingface.co/DeepSeek/DeepSeek-OCR)

A containerized OCR application using the DeepSeek-OCR model with vLLM and a React frontend.

## Table of contents

- Quickstart
- Prerequisites
- Model download
- Configuration
- Architecture
- Features
- API Endpoints
- Usage
- Development
- Troubleshooting
- Disclaimer

## Quickstart

Start the app with Docker Compose (recommended):

```bash
docker-compose up -d
```

Then open the web UI at http://localhost:8080

## Prerequisites

- Docker & Docker Compose
- git-lfs (for model download) — https://git-lfs.com
- DeepSeek-OCR model files (see below)
- ROCm-compatible AMD GPU (if you plan to use GPU acceleration)

## Download model files

Make sure `git-lfs` is installed and then clone the model (approx 7 GB):

```bash
git lfs install
# Default path is set in .env as MODEL_HOST_PATH
git clone https://huggingface.co/DeepSeek/DeepSeek-OCR ./models
```

Place the model directory on the host and set `MODEL_HOST_PATH` in `.env` (see Configuration).

## Configuration

Configuration is sourced from a `.env` file at the project root and is used by `docker-compose`.

Create a local copy and edit it:

```bash
cp .env.example .env
# edit .env and set MODEL_HOST_PATH to the host model directory
```

Key environment variables (see `.env.example` for full list):

- `MODEL_HOST_PATH` — absolute path on the host where the DeepSeek-OCR model lives.
- `MODEL_CONTAINER_PATH` — path inside the container where the model will be mounted (for example `/models/DeepSeek-OCR`).
- `MODEL_PATH` — inside the container this will be set to `MODEL_CONTAINER_PATH` so application code reads the container path.
- `PORT` / `HOST` — FastAPI host/port (defaults: `0.0.0.0:9000`).
- `HIP_VISIBLE_DEVICES` / `CUDA_VISIBLE_DEVICES` — GPU device selection.

Why host/container separation?

- The compose file maps `${MODEL_HOST_PATH}:${MODEL_CONTAINER_PATH}:ro` and sets `MODEL_PATH=${MODEL_CONTAINER_PATH}` inside the container. This keeps container configuration portable and avoids hard-coded host paths in the app.

### Model requirements

- DeepSeek-OCR model files must exist at `MODEL_HOST_PATH` on the host and be readable by Docker.
- ROCm-compatible AMD GPU (optional but recommended for performance).
- Sufficient VRAM for model loading.

## Architecture

- **Frontend**: React TypeScript app built with Vite (`/frontend`)
- **OCR Service**: FastAPI app using vLLM and the DeepSeek-OCR model (`/Vllm`)
- **Reverse Proxy**: Nginx for routing (`/nginx`)
- **Orchestration**: Docker Compose (`docker-compose.yml`)

## Features

- File upload: upload images directly to the OCR service
- Dual output formats:
   - Plain text (raw OCR)
   - Markdown (structured document conversion)
- ROCm support for AMD GPUs
- Responsive React UI

## API Endpoints

### OCR Processing

- `POST /api/ocr` — Upload image file for OCR processing
   - Form data: `file` (image) and `output_format` ("text" or "markdown")
- `POST /api/ocr-base64` — Process base64 encoded image
- `GET /api/health` — Health check

#### Examples (curl)

Upload a local file (multipart/form-data) and save plain text output to a file:

```bash
curl -sS -X POST "http://localhost:8080/api/ocr" \
   -F "file=@/path/to/sample.jpg" \
   -F "output_format=text" \
   -o result.txt
```

If the API returns JSON with a text field, you can pipe to jq:

```bash
curl -sS -X POST "http://localhost:8080/api/ocr" \
   -F "file=@/path/to/sample.jpg" \
   -F "output_format=markdown" | jq -r '.text' > result.md
```

Send a base64-encoded image (JSON payload):

```bash
IMG_BASE64=$(base64 -w0 /path/to/sample.jpg)
echo "{\"image_base64\":\"$IMG_BASE64\"}" > payload.json
curl -sS -X POST "http://localhost:8080/api/ocr-base64" \
   -H "Content-Type: application/json" \
   -d @payload.json
```

## Usage (web UI)

1. Start the application:

```bash
docker-compose up -d
```

2. Open http://localhost:8080

3. Upload an image, choose output format (Text or Markdown), and click "Extract Text".

## How to test locally

If you want a quick, local smoke test (without using the web UI), start the services and use curl to call the OCR API.

1. Start services:

```bash
docker-compose up -d
```

2. Multipart file test (save plain text to a file):

```bash
curl -sS -X POST "http://localhost:8080/api/ocr" \
   -F "file=@/path/to/sample.jpg" \
   -F "output_format=text" \
   -o test-output.txt
cat test-output.txt
```

3. Base64 JSON test (useful for programmatic clients):

```bash
IMG_BASE64=$(base64 -w0 /path/to/sample.jpg)
echo "{\"image_base64\":\"$IMG_BASE64\"}" > payload.json
curl -sS -X POST "http://localhost:8080/api/ocr-base64" \
   -H "Content-Type: application/json" \
   -d @payload.json | jq .
```

Notes:
- Replace `/path/to/sample.jpg` with a real image path.
- If your FastAPI service runs on a different port, update the URL (default in this repo: 9000).

Notes about ports:

- When you start the project with `docker-compose up -d` the `nginx` service is published to the host at `NGINX_PORT` (default 8080). The README curl examples above use the nginx proxy URL (http://localhost:8080/api/...) which will route requests to the vLLM service inside Docker.
- If you run the OCR service standalone (for development) with `python Vllm/app.py` or if you publish the vllm port in `docker-compose.yml`, you can call the service directly on port 9000 (`http://localhost:9000/ocr` or `http://localhost:9000/ocr-base64`).

## Development

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### OCR Service (local)

```bash
cd Vllm
pip install -r requirements.txt
python app.py
```

## Troubleshooting

- Model loading errors: check `MODEL_PATH` / `MODEL_HOST_PATH` and file permissions
- GPU access issues: verify ROCm installation and device permissions
- Memory errors: reduce `max_tokens` or check available VRAM
- Upload failures: check `nginx` `client_max_body_size` setting

## Disclaimer (Proof of Concept / Safety)

This repository is provided as a proof-of-concept. There are no guarantees about performance, accuracy, or safety.
Use at your own risk. Validate results before using in production. The project may expose sensitive data depending on your inputs; take appropriate precautions and follow your organization’s security policies.

---

For more information see the project files and examples in the repository.