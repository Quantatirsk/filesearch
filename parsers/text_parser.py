"""
Enhanced text file parser supporting all text-based file formats.

This parser supports a comprehensive list of text-based file formats including:
- Programming languages (Python, JavaScript, Java, C/C++, etc.)
- Configuration files (JSON, YAML, XML, INI, etc.)
- Documentation files (Markdown, reStructuredText, etc.)
- Web technologies (HTML, CSS, etc.)
- Shell scripts and other text formats
"""

from typing import Optional
from .base_parser import BaseParser


class EnhancedTextParser(BaseParser):
    """
    Enhanced parser for all text-based file formats.
    
    Supports programming languages, configuration files, documentation,
    and other text-based formats commonly found in software projects.
    """
    
    def parse(self, file_path: str) -> Optional[str]:
        """
        Parse any text-based file.
        
        Args:
            file_path: Path to the text file
            
        Returns:
            File content as string or None if parsing fails
        """
        try:
            # Try multiple encodings to handle different file types
            encodings = ['utf-8', 'utf-8-sig', 'latin-1', 'cp1252', 'iso-8859-1']
            
            for encoding in encodings:
                try:
                    with open(file_path, 'r', encoding=encoding, errors='ignore') as f:
                        content = f.read()
                        # If we successfully read content, return it
                        if content:
                            return content
                except UnicodeDecodeError:
                    continue
                except Exception:
                    continue
            
            # If all encodings fail, try reading as binary and decode with errors ignored
            with open(file_path, 'rb') as f:
                raw_content = f.read()
                return raw_content.decode('utf-8', errors='ignore')
                
        except Exception as e:
            print(f"Error parsing text file {file_path}: {e}")
            return None
    
    def is_supported(self, file_path: str) -> bool:
        """
        Check if a file is supported by this parser.
        Includes support for common files without extensions.
        """
        from pathlib import Path
        
        file_path_obj = Path(file_path)
        file_ext = file_path_obj.suffix.lower()
        file_name = file_path_obj.name.lower()
        
        # Check by extension first
        if file_ext in self.get_supported_extensions():
            return True
            
        # Check common files without extensions
        extensionless_files = {
            'dockerfile', 'containerfile', 'makefile', 'rakefile', 'gemfile', 'procfile',
            'vagrantfile', 'berksfile', 'guardfile', 'capfile', 'thorfile', 'buildfile',
            'license', 'readme', 'changelog', 'authors', 'contributors', 'copying',
            'install', 'news', 'todo', 'bugs', 'credits', 'acknowledgments'
        }
        
        return file_name in extensionless_files
    
    def get_supported_extensions(self) -> list:
        """Get all supported text-based file extensions."""
        return [
            # Basic text files
            '.txt', '.text', '.md', '.markdown', '.rst', '.rtf',
            
            # Programming languages
            '.py', '.pyx', '.pyi', '.pyw',  # Python
            '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs',  # JavaScript/TypeScript
            '.java', '.scala', '.kotlin', '.groovy',  # JVM languages
            '.c', '.h', '.cpp', '.cxx', '.cc', '.hpp', '.hxx',  # C/C++
            '.cs', '.vb', '.fs', '.fsx',  # .NET languages
            '.php', '.php3', '.php4', '.php5', '.phtml',  # PHP
            '.rb', '.rbw', '.rake', '.gemspec',  # Ruby
            '.go', '.mod', '.sum',  # Go
            '.rs', '.toml',  # Rust
            '.swift',  # Swift
            '.dart',  # Dart
            '.kt', '.kts',  # Kotlin
            '.pl', '.pm', '.pod',  # Perl
            '.lua',  # Lua
            '.r', '.R', '.rmd',  # R
            '.m', '.mm',  # Objective-C
            '.pas', '.pp', '.inc',  # Pascal
            '.asm', '.s',  # Assembly
            '.sql', '.mysql', '.pgsql', '.sqlite',  # SQL
            '.vbs', '.vba',  # Visual Basic
            '.ps1', '.psm1', '.psd1',  # PowerShell
            '.nim', '.nims',  # Nim
            '.zig',  # Zig
            '.jl',  # Julia
            '.elm',  # Elm
            '.ex', '.exs',  # Elixir
            '.erl', '.hrl',  # Erlang
            '.clj', '.cljs', '.cljc', '.edn',  # Clojure
            '.hs', '.lhs',  # Haskell
            '.ml', '.mli',  # OCaml
            '.v', '.vh', '.sv', '.svh',  # Verilog/SystemVerilog
            '.vhd', '.vhdl',  # VHDL
            '.tcl',  # Tcl
            '.lisp', '.lsp', '.cl', '.el',  # Lisp dialects
            '.scm', '.ss', '.rkt',  # Scheme/Racket
            '.f', '.f90', '.f95', '.f03', '.f08',  # Fortran
            '.cob', '.cbl', '.cpy',  # COBOL
            '.ada', '.adb', '.ads',  # Ada
            '.d',  # D
            '.cr',  # Crystal
            '.hx',  # Haxe
            '.purs',  # PureScript
            '.reason', '.re', '.rei',  # ReasonML
            '.coffee',  # CoffeeScript
            '.ls',  # LiveScript
            '.ts',  # TypeScript
            '.flow',  # Flow
            '.ino', '.pde',  # Arduino
            
            # Web technologies
            '.html', '.htm', '.xhtml', '.shtml',  # HTML
            '.css', '.scss', '.sass', '.less', '.styl',  # CSS and preprocessors
            '.vue', '.svelte',  # Vue/Svelte components
            '.xml', '.xsl', '.xslt', '.xsd', '.dtd',  # XML
            '.svg',  # SVG
            '.jsp', '.jspx', '.asp', '.aspx',  # Server pages
            '.ejs', '.erb', '.haml', '.jade', '.pug',  # Template engines
            '.mustache', '.hbs', '.handlebars',  # Handlebars
            '.twig',  # Twig
            
            # Configuration files
            '.json', '.jsonc', '.json5',  # JSON
            '.yaml', '.yml',  # YAML
            '.toml',  # TOML
            '.ini', '.cfg', '.conf', '.config',  # INI/Config
            '.properties',  # Java properties
            '.env', '.environment',  # Environment files
            '.dockerfile', '.containerfile',  # Docker
            '.makefile', '.mk',  # Makefiles
            '.cmake',  # CMake
            '.gradle',  # Gradle
            '.sbt',  # SBT
            '.pom',  # Maven POM
            '.build', '.bazel', '.bzl',  # Bazel
            '.nix',  # Nix
            '.terraform', '.tf', '.tfvars',  # Terraform
            '.k8s', '.kube',  # Kubernetes
            '.ansible',  # Ansible
            '.vagrant',  # Vagrant
            
            # Shell scripts
            '.sh', '.bash', '.zsh', '.fish', '.csh', '.tcsh', '.ksh',  # Unix shells
            '.bat', '.cmd',  # Windows batch
            
            # Build files
            '.make', '.am', '.in',  # Autotools
            '.pro', '.pri',  # Qt project files
            '.vcxproj', '.vcproj', '.sln',  # Visual Studio
            '.pbxproj', '.xcodeproj',  # Xcode
            
            # Documentation
            '.tex', '.latex', '.cls', '.sty',  # LaTeX
            '.pod',  # Perl POD
            '.rdoc',  # RDoc
            '.org',  # Org mode
            '.wiki',  # Wiki markup
            '.textile',  # Textile
            '.asciidoc', '.adoc',  # AsciiDoc
            
            # Data formats
            '.tsv', '.tab',  # Tab-separated values
            '.log',  # Log files
            '.diff', '.patch',  # Diff/patch files
            '.gitignore', '.gitattributes', '.gitmodules',  # Git files
            '.editorconfig',  # Editor config
            '.eslintrc', '.prettierrc', '.babelrc',  # JS tool configs
            '.pylintrc', '.flake8', '.mypy.ini',  # Python tool configs
            
            # Other text formats
            '.txt', '.text',  # Plain text
            '.readme', '.license', '.changelog', '.authors',  # Project files
            '.todo', '.fixme',  # Task files
            '.spec', '.test',  # Specification/test files
            '.template', '.tmpl', '.tpl',  # Template files
            '.snippet', '.snip',  # Code snippets
            '.example', '.sample',  # Example files
        ]


# Update the basic PlainTextParser to be replaced by EnhancedTextParser
class PlainTextParser(EnhancedTextParser):
    """
    Backward compatible plain text parser.
    Now inherits from EnhancedTextParser for extended functionality.
    """
    pass