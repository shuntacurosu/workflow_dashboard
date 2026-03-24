import argparse
import time
import sys

def main():
    parser = argparse.ArgumentParser(description="Data Processor Task")
    parser.add_argument("--input", default="input.json", help="Input file path")
    parser.add_argument("--output", default="output.json", help="Output file path")
    args = parser.parse_args()

    print(f"Starting Data Processor Task from {args.input} to {args.output}")
    for i in range(5):
        print(f"[{time.strftime('%H:%M:%S')}] Processing batch {i+1}/5...")
        time.sleep(1.5)
    
    print(f"Data saved to {args.output}. Task completed.")

if __name__ == "__main__":
    main()
