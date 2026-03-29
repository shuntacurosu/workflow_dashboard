import time
import sys
import os
from loguru import logger

def main():
    os.makedirs('log', exist_ok=True)
    logger.remove()
    logger.add(sys.stdout, format="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | <level>{level: <8}</level> | <cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> - <level>{message}</level>")
    logger.add("log/task.log", format="{time:YYYY-MM-DD HH:mm:ss} | {level: <8} | {name}:{function}:{line} - {message}", rotation="10 MB", enqueue=True)

    logger.info("Starting Report Generator Task")
    for i in range(2):
        logger.info(f"Generating report section {i+1}/4...")
        time.sleep(1)
    
    # Intentional error simulation
    logger.error("Failed to generate report section 3: Database connection timeout")
    logger.critical("Task aborted due to critical failure")
    
    # Actually raise an exception for a "hard" failure if needed, 
    # but the user asked to show ERROR level logging.
    # sys.exit(1)

if __name__ == "__main__":
    main()
