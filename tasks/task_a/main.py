import argparse
import time
import sys

def main():
    parser = argparse.ArgumentParser(description="Data Fetcher Task")
    parser.add_argument("--url", default="https://example.com", help="URL to fetch data from")
    parser.add_argument("--count", type=int, default=5, help="Number of items to fetch")
    args = parser.parse_args()

    print(f"Starting Data Fetcher Task with url={args.url}, count={args.count}")
    for i in range(args.count):
        print(f"[{time.strftime('%H:%M:%S')}] Fetching item {i+1}/{args.count} from {args.url}...")
        time.sleep(1)
    
    print("Data Fetcher Task completed successfully.")

if __name__ == "__main__":
    main()
