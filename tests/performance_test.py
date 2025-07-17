import time
import psutil
import gc
import os
from concurrent.futures import ThreadPoolExecutor, as_completed
from threading import Lock
from doc2txt import extract_text

def process_single_file(task_id, doc_file_path, output_dir):
    """Process a single doc file and return the extracted text"""
    try:
        text = extract_text(doc_file_path, optimize_format=True)
        
        # Write extracted text to individual txt file
        output_file = os.path.join(output_dir, f"extracted_{task_id:05d}.txt")
        with open(output_file, 'w', encoding='utf-8') as f:
            f.write(text)
        
        return task_id, text, None
    except Exception as e:
        return task_id, None, str(e)

def performance_test():
    """Performance test for pyantiword library - extract text from 10000 doc files using concurrent execution"""
    
    # Get initial memory usage
    process = psutil.Process()
    initial_memory = process.memory_info().rss / 1024 / 1024  # MB
    
    print(f"Starting concurrent performance test...")
    print(f"Initial memory usage: {initial_memory:.2f} MB")
    
    # Create output directory for txt files
    output_dir = "extracted_texts"
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)
    
    # Store all extracted texts in memory
    extracted_texts = [None] * 10000  # Pre-allocate list
    completed_count = 0
    errors = []
    
    # Thread-safe progress tracking
    progress_lock = Lock()
    
    # Start timing
    start_time = time.time()
    
    # Determine optimal number of workers (CPU cores * 2 for IO-bound tasks)
    max_workers = min(32, (os.cpu_count() or 1) * 2)
    print(f"Using {max_workers} concurrent workers")
    
    # Process files concurrently
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        # Submit all tasks
        future_to_id = {
            executor.submit(process_single_file, i + 1, "demo.doc", output_dir): i + 1
            for i in range(10000)
        }
        
        # Process completed tasks
        for future in as_completed(future_to_id):
            task_id, text, error = future.result()
            
            with progress_lock:
                completed_count += 1
                
                if error:
                    errors.append(f"Task {task_id}: {error}")
                else:
                    extracted_texts[task_id - 1] = text
                
                # Print progress every 1000 completions
                if completed_count % 1000 == 0:
                    current_memory = process.memory_info().rss / 1024 / 1024  # MB
                    elapsed = time.time() - start_time
                    print(f"Completed {completed_count}/10000 files | "
                          f"Elapsed: {elapsed:.2f}s | "
                          f"Memory: {current_memory:.2f} MB")
    
    # Remove None values (failed tasks)
    extracted_texts = [text for text in extracted_texts if text is not None]
    
    if errors:
        print(f"\nErrors encountered: {len(errors)}")
        for error in errors[:5]:  # Show first 5 errors
            print(f"  {error}")
        if len(errors) > 5:
            print(f"  ... and {len(errors) - 5} more errors")
    
    # End timing
    end_time = time.time()
    total_time = end_time - start_time
    
    # Final memory usage
    final_memory = process.memory_info().rss / 1024 / 1024  # MB
    memory_increase = final_memory - initial_memory
    
    # Calculate statistics
    successful_files = len(extracted_texts)
    avg_time_per_file = total_time / successful_files if successful_files > 0 else 0
    files_per_second = successful_files / total_time if total_time > 0 else 0
    
    # Get text statistics
    total_chars = sum(len(text) for text in extracted_texts)
    avg_chars_per_file = total_chars / successful_files if successful_files > 0 else 0
    
    print("\n" + "="*50)
    print("CONCURRENT PERFORMANCE TEST RESULTS")
    print("="*50)
    print(f"Total files attempted: 10000")
    print(f"Successfully processed: {successful_files}")
    print(f"Failed files: {len(errors)}")
    print(f"Total time: {total_time:.2f} seconds")
    print(f"Average time per file: {avg_time_per_file:.4f} seconds")
    print(f"Files per second: {files_per_second:.2f}")
    print(f"Workers used: {max_workers}")
    print(f"Initial memory: {initial_memory:.2f} MB")
    print(f"Final memory: {final_memory:.2f} MB")
    print(f"Memory increase: {memory_increase:.2f} MB")
    print(f"Total characters extracted: {total_chars:,}")
    print(f"Average characters per file: {avg_chars_per_file:.0f}")
    print(f"Output files saved to: {output_dir}/")
    print("="*50)
    
    return {
        'total_files': successful_files,
        'failed_files': len(errors),
        'total_time': total_time,
        'avg_time_per_file': avg_time_per_file,
        'files_per_second': files_per_second,
        'workers_used': max_workers,
        'memory_increase': memory_increase,
        'total_chars': total_chars,
        'texts': extracted_texts,
        'errors': errors
    }

if __name__ == "__main__":
    results = performance_test()