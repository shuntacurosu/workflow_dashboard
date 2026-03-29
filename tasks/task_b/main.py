import time
import sys
import os
from loguru import logger

def main():
    os.makedirs('log', exist_ok=True)
    logger.remove()
    logger.add(sys.stdout, format="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | <level>{level: <8}</level> | <cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> - <level>{message}</level>")
    logger.add("log/task.log", format="{time:YYYY-MM-DD HH:mm:ss} | {level: <8} | {name}:{function}:{line} - {message}", rotation="10 MB", enqueue=True)

    logger.info("Starting Data Processor Task")
    for i in range(3):
        logger.info(f"Processing data chunk {i+1}/3...")
        time.sleep(1.5)
    
    logger.success("Data Processor Task completed successfully.")

if __name__ == "__main__":
    main()
