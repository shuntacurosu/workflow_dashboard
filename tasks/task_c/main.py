import argparse
import time
import sys

def main():
    parser = argparse.ArgumentParser(description="Report Generator Task")
    parser.add_argument("--format", choices=["pdf", "html", "csv"], default="pdf", help="Report format")
    parser.add_argument("--target", default="report", help="Target filename")
    args = parser.parse_args()

    print(f"Starting Report Generator Task. Format: {args.format}, Target: {args.target}")
    steps = ["Generating charts", "Aggregating data", "Formatting report", "Saving file"]
    for i, step in enumerate(steps):
        print(f"[{time.strftime('%H:%M:%S')}] Step {i+1}/{len(steps)}: {step}...")
        time.sleep(2)
    
    print(f"Report '{args.target}.{args.format}' generated. Task completed.")

if __name__ == "__main__":
    main()
