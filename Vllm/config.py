#!/usr/bin/env python3
"""
Configuration management for DeepSeek OCR application
Provides consistent environment variable handling with defaults and validation
"""

import os
import logging
from typing import Optional
from pathlib import Path

logger = logging.getLogger(__name__)

class Config:
    """Centralized configuration management"""

    # Model Configuration
    MODEL_PATH: str = os.getenv("MODEL_PATH")

    # Server Configuration
    HOST: str = os.getenv("HOST", "0.0.0.0")
    PORT: int = int(os.getenv("PORT", "9000"))

    # GPU Configuration
    HIP_VISIBLE_DEVICES: str = os.getenv("HIP_VISIBLE_DEVICES", "0")
    CUDA_VISIBLE_DEVICES: str = os.getenv("CUDA_VISIBLE_DEVICES", "")

    # VLLM Configuration
    VLLM_WORKER_MULTIPROC_METHOD: str = os.getenv("VLLM_WORKER_MULTIPROC_METHOD", "spawn")
    PYTORCH_ROCM_ARCH: str = os.getenv("PYTORCH_ROCM_ARCH", "gfx1100")

    @classmethod
    def validate(cls) -> None:
        """Validate configuration and log warnings for potential issues"""
        # Check if model path exists
        model_path = Path(cls.MODEL_PATH)
        if not model_path.exists():
            logger.warning(f"Model path does not exist: {cls.MODEL_PATH}")
        else:
            # Basic heuristic: ensure the model directory contains at least one
            # recognized model artifact so vLLM can load it.
            found_config = (model_path / "config.json").exists()
            found_params = (model_path / "params.json").exists()
            found_gguf = any(model_path.glob("*.gguf"))

            if not (found_config or found_params or found_gguf):
                # Provide a descriptive message to help the operator fix mounts
                raise FileNotFoundError(
                    f"No recognized model files found in '{model_path}'.\n"
                    "vLLM expects either a HuggingFace repo layout (config.json),\n"
                    "a Mistral-style model (params.json), or a GGUF checkpoint (*.gguf).\n"
                    "Ensure you set MODEL_HOST_PATH in your .env to the host directory\n"
                    "that contains the model files and that docker-compose maps it\n"
                    "into the container at MODEL_CONTAINER_PATH. See README and .env.example for guidance."
                )

        # Validate port range
        if not (1 <= cls.PORT <= 65535):
            raise ValueError(f"Invalid port number: {cls.PORT}. Must be between 1 and 65535")

        # Validate host
        if not cls.HOST:
            raise ValueError("HOST cannot be empty")

        logger.info(f"Configuration loaded - Model: {cls.MODEL_PATH}, Host: {cls.HOST}:{cls.PORT}")

    @classmethod
    def get_model_path(cls) -> Path:
        """Get validated model path"""
        path = Path(cls.MODEL_PATH)
        if not path.exists():
            raise FileNotFoundError(f"Model path does not exist: {path}")
        return path

    @classmethod
    def is_development(cls) -> bool:
        """Check if running in development mode"""
        return os.getenv("NODE_ENV", "production") == "development"

# Validate configuration on import
Config.validate()