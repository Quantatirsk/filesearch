"""
Main entry point for the File Search application.

A high-performance document search tool with support for multiple file formats,
concurrent indexing, and hybrid fuzzy search capabilities.
"""

import argparse
import sys
import os

# Add the project root to Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from core.search_manager import SearchManager, SearchResultFormatter
from core.indexer import DocumentIndexer, IncrementalIndexer
from core.database import DocumentDatabase
from parsers.base_parser import ParserFactory


def main():
    """Main entry point for the application."""
    parser = argparse.ArgumentParser(
        description="High-performance document search tool",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Index a directory
  python main.py index /path/to/documents

  # Search for exact phrase
  python main.py search "python programming" --type exact

  # Fuzzy search with minimum similarity score
  python main.py search "pythn programing" --type fuzzy --min-score 40

  # Fuzzy search
  python main.py search "pythn programing" --type fuzzy --min-score 40

  # Path search
  python main.py search "*.pdf" --type path

  # Interactive mode
  python main.py interactive

  # Show database statistics
  python main.py stats
        """
    )
    
    # Add subcommands
    subparsers = parser.add_subparsers(dest='command', help='Available commands')
    
    # Index command
    index_parser = subparsers.add_parser('index', help='Index documents in a directory')
    index_parser.add_argument('directory', help='Directory to index')
    index_parser.add_argument('--force', action='store_true', 
                             help='Force reindexing of all files')
    index_parser.add_argument('--workers', type=int, 
                             help='Number of worker processes')
    index_parser.add_argument('--db', default='documents.db', 
                             help='Database file path')
    
    # Search command
    search_parser = subparsers.add_parser('search', help='Search documents')
    search_parser.add_argument('query', help='Search query')
    search_parser.add_argument('--type', choices=['exact', 'fuzzy', 'path'], 
                              default='exact', help='Search type')
    search_parser.add_argument('--limit', type=int, default=20, 
                              help='Maximum number of results')
    search_parser.add_argument('--min-score', type=float, default=30.0, 
                              help='Minimum similarity score for fuzzy search')
    search_parser.add_argument('--no-content', action='store_true', 
                              help='Hide content previews')
    search_parser.add_argument('--db', default='documents.db', 
                              help='Database file path')
    
    # Advanced search command
    advanced_parser = subparsers.add_parser('advanced', help='Advanced search with filters')
    advanced_parser.add_argument('--content', help='Content search query')
    advanced_parser.add_argument('--path', help='Path search query')
    advanced_parser.add_argument('--types', nargs='+', 
                                help='File types to include (pdf, docx, etc.)')
    advanced_parser.add_argument('--fuzzy', action='store_true', 
                                help='Use fuzzy matching for content')
    advanced_parser.add_argument('--limit', type=int, default=20, 
                                help='Maximum number of results')
    advanced_parser.add_argument('--db', default='documents.db', 
                                help='Database file path')
    
    # Interactive mode
    interactive_parser = subparsers.add_parser('interactive', help='Interactive search mode')
    interactive_parser.add_argument('--db', default='documents.db', 
                                   help='Database file path')
    
    # Statistics command
    stats_parser = subparsers.add_parser('stats', help='Show database statistics')
    stats_parser.add_argument('--db', default='documents.db', 
                             help='Database file path')
    
    # Move command
    move_parser = subparsers.add_parser('move', help='Move files based on search results')
    move_parser.add_argument('query', help='Search query to find files')
    move_parser.add_argument('destination', help='Destination directory')
    move_parser.add_argument('--type', choices=['exact', 'fuzzy', 'path'], 
                            default='exact', help='Search type')
    move_parser.add_argument('--confirm', action='store_true', 
                            help='Confirm before moving files')
    move_parser.add_argument('--db', default='documents.db', 
                            help='Database file path')
    
    # Update command
    update_parser = subparsers.add_parser('update', help='Update index for a single file')
    update_parser.add_argument('file_path', help='File to update')
    update_parser.add_argument('--db', default='documents.db', 
                              help='Database file path')
    
    # Remove command
    remove_parser = subparsers.add_parser('remove', help='Remove file from index')
    remove_parser.add_argument('file_path', help='File to remove')
    remove_parser.add_argument('--db', default='documents.db', 
                              help='Database file path')
    
    # Supported formats command
    formats_parser = subparsers.add_parser('formats', help='Show supported file formats')
    
    # Parse arguments
    args = parser.parse_args()
    
    # Handle commands
    if args.command == 'index':
        handle_index(args)
    elif args.command == 'search':
        handle_search(args)
    elif args.command == 'advanced':
        handle_advanced_search(args)
    elif args.command == 'interactive':
        handle_interactive(args)
    elif args.command == 'stats':
        handle_stats(args)
    elif args.command == 'move':
        handle_move(args)
    elif args.command == 'update':
        handle_update(args)
    elif args.command == 'remove':
        handle_remove(args)
    elif args.command == 'formats':
        handle_formats()
    else:
        parser.print_help()


def handle_index(args):
    """Handle the index command."""
    print(f"Indexing directory: {args.directory}")
    print(f"Database: {args.db}")
    
    if not os.path.exists(args.directory):
        print(f"Error: Directory '{args.directory}' does not exist")
        return
    
    # Create indexer
    indexer = DocumentIndexer(args.db, args.workers)
    
    # Start indexing
    try:
        stats = indexer.index_directory(args.directory, args.force)
        
        # Print results
        print(f"\\nIndexing completed in {stats['duration_seconds']:.2f} seconds")
        print(f"Total files found: {stats['total_files']}")
        print(f"Successfully processed: {stats['processed_files']}")
        print(f"Failed: {stats['failed_files']}")
        
        if stats['duration_seconds'] > 0:
            print(f"Processing speed: {stats['files_per_second']:.2f} files/second")
        
        if stats['errors']:
            print(f"\\nFirst few errors:")
            for error in stats['errors'][:5]:
                print(f"  - {error}")
    
    except KeyboardInterrupt:
        print("\\nIndexing interrupted by user")
    except Exception as e:
        print(f"Error during indexing: {e}")


def handle_search(args):
    """Handle the search command."""
    search_manager = SearchManager(args.db)
    
    # Perform search
    result = search_manager.search(
        args.query, 
        args.type, 
        args.limit, 
        args.min_score
    )
    
    if not result['success']:
        print(f"Search error: {result['error']}")
        return
    
    # Display results
    print(f"Search query: '{args.query}' ({args.type})")
    print(f"Found {result['total_results']} results in {result['search_time']:.3f} seconds")
    print()
    
    if result['results']:
        formatted_output = SearchResultFormatter.format_console_output(
            result['results'], 
            not args.no_content
        )
        print(formatted_output)
    else:
        print("No results found.")


def handle_advanced_search(args):
    """Handle the advanced search command."""
    if not args.content and not args.path:
        print("Error: At least one of --content or --path must be specified")
        return
    
    search_manager = SearchManager(args.db)
    
    # Perform advanced search
    result = search_manager.search_advanced(
        content_query=args.content,
        path_query=args.path,
        file_types=args.types,
        fuzzy=args.fuzzy,
        limit=args.limit
    )
    
    if not result['success']:
        print(f"Search error: {result['error']}")
        return
    
    # Display results
    print("Advanced search results:")
    if args.content:
        print(f"  Content: '{args.content}' ({'fuzzy' if args.fuzzy else 'exact'})")
    if args.path:
        print(f"  Path: '{args.path}'")
    if args.types:
        print(f"  File types: {', '.join(args.types)}")
    
    print(f"\\nFound {result['total_results']} results in {result['search_time']:.3f} seconds")
    print()
    
    if result['results']:
        formatted_output = SearchResultFormatter.format_console_output(result['results'])
        print(formatted_output)
    else:
        print("No results found.")


def handle_interactive(args):
    """Handle interactive mode."""
    search_manager = SearchManager(args.db)
    
    print("=== Interactive File Search ===")
    print("Commands:")
    print("  search <query>        - Exact search")
    print("  fuzzy <query>         - Fuzzy search")
    print("  boolean <query>       - Boolean search")
    print("  path <pattern>        - Path search")
    print("  stats                 - Show database statistics")
    print("  help                  - Show this help")
    print("  quit                  - Exit")
    print()
    
    while True:
        try:
            user_input = input("filesearch> ").strip()
            
            if not user_input:
                continue
            
            if user_input.lower() in ['quit', 'exit', 'q']:
                break
            
            if user_input.lower() == 'help':
                print("Available commands: search, fuzzy, boolean, path, stats, help, quit")
                continue
            
            if user_input.lower() == 'stats':
                stats = search_manager.get_search_stats()
                print(SearchResultFormatter.format_stats(stats))
                continue
            
            # Parse command
            parts = user_input.split(' ', 1)
            if len(parts) < 2:
                print("Error: Please provide a search query")
                continue
            
            command, query = parts
            
            # Execute search
            if command.lower() == 'search':
                result = search_manager.search(query, 'exact', 10)
            elif command.lower() == 'fuzzy':
                result = search_manager.search(query, 'fuzzy', 10)
            elif command.lower() == 'boolean':
                result = search_manager.search(query, 'boolean', 10)
            elif command.lower() == 'path':
                result = search_manager.search(query, 'path', 10)
            else:
                print(f"Unknown command: {command}")
                continue
            
            # Display results
            if result['success']:
                print(f"Found {result['total_results']} results in {result['search_time']:.3f} seconds")
                if result['results']:
                    formatted_output = SearchResultFormatter.format_console_output(
                        result['results'], True
                    )
                    print(formatted_output)
                else:
                    print("No results found.")
            else:
                print(f"Search error: {result['error']}")
            
        except KeyboardInterrupt:
            print("\\nGoodbye!")
            break
        except EOFError:
            print("\\nGoodbye!")
            break
        except Exception as e:
            print(f"Error: {e}")


def handle_stats(args):
    """Handle the stats command."""
    search_manager = SearchManager(args.db)
    stats = search_manager.get_search_stats()
    
    formatted_stats = SearchResultFormatter.format_stats(stats)
    print(formatted_stats)


def handle_move(args):
    """Handle the move command."""
    search_manager = SearchManager(args.db)
    
    # First, perform search to find files
    result = search_manager.search(args.query, args.type, 1000)
    
    if not result['success']:
        print(f"Search error: {result['error']}")
        return
    
    if not result['results']:
        print("No files found matching the search query.")
        return
    
    # Extract file paths
    file_paths = [r['file_path'] for r in result['results']]
    
    print(f"Found {len(file_paths)} files to move:")
    for i, path in enumerate(file_paths[:10], 1):
        print(f"  {i}. {path}")
    
    if len(file_paths) > 10:
        print(f"  ... and {len(file_paths) - 10} more files")
    
    # Confirm if requested
    if args.confirm:
        response = input(f"\\nMove {len(file_paths)} files to '{args.destination}'? (y/N): ")
        if response.lower() != 'y':
            print("Operation cancelled.")
            return
    
    # Move files
    print(f"\\nMoving files to: {args.destination}")
    move_result = search_manager.move_files(file_paths, args.destination)
    
    if move_result['success']:
        print(f"Successfully moved {move_result['success_count']} files")
        
        if move_result['error_count'] > 0:
            print(f"Failed to move {move_result['error_count']} files:")
            for failed in move_result['failed_files'][:5]:
                print(f"  - {failed['src']}: {failed['error']}")
    else:
        print(f"Move operation failed: {move_result['error']}")


def handle_update(args):
    """Handle the update command."""
    if not os.path.exists(args.file_path):
        print(f"Error: File '{args.file_path}' does not exist")
        return
    
    updater = IncrementalIndexer(args.db)
    
    print(f"Updating index for: {args.file_path}")
    
    if updater.update_file(args.file_path):
        print("File updated successfully")
    else:
        print("Failed to update file")


def handle_remove(args):
    """Handle the remove command."""
    updater = IncrementalIndexer(args.db)
    
    print(f"Removing from index: {args.file_path}")
    
    if updater.remove_file(args.file_path):
        print("File removed successfully")
    else:
        print("Failed to remove file")


def handle_formats():
    """Handle the formats command."""
    print("Supported file formats:")
    print()
    
    extensions = ParserFactory.get_supported_extensions()
    
    format_info = {
        '.pdf': 'PDF documents (using PyMuPDF)',
        '.docx': 'Microsoft Word documents (using lxml)',
        '.doc': 'Legacy Microsoft Word documents (using antiword)',
        '.xlsx': 'Microsoft Excel spreadsheets (using python-calamine)',
        '.xls': 'Legacy Microsoft Excel spreadsheets (using xlrd)',
        '.csv': 'Comma-separated values (using pandas)',
        '.txt': 'Plain text files',
        '.md': 'Markdown documents'
    }
    
    for ext in sorted(extensions):
        description = format_info.get(ext, 'Unknown format')
        print(f"  {ext:<6} - {description}")
    
    print(f"\\nTotal: {len(extensions)} supported formats")


if __name__ == '__main__':
    main()