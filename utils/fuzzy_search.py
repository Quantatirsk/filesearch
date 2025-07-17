"""
Fuzzy search utilities using RapidFuzz.

Following the technical report's recommendation for the hybrid search model:
- FTS5 for initial candidate filtering
- RapidFuzz for precise similarity scoring
"""

from typing import List, Dict, Any, Optional, Tuple
import re
try:
    from .chinese_tokenizer import chinese_tokenizer
    JIEBA_AVAILABLE = True
except ImportError:
    JIEBA_AVAILABLE = False


class FuzzySearchUtils:
    """
    Fuzzy search utilities implementing the hybrid search model.
    
    Following the technical report's architecture:
    1. Use FTS5 for fast candidate filtering from large datasets
    2. Use RapidFuzz for precise similarity scoring on small candidate sets
    """
    
    @staticmethod
    def preprocess_query(query: str) -> List[str]:
        """
        Preprocess a fuzzy query to extract meaningful terms.
        
        Args:
            query: Raw search query
            
        Returns:
            List of processed query terms
        """
        # Use jieba for Chinese text tokenization if available
        if JIEBA_AVAILABLE and any('\u4e00' <= char <= '\u9fff' for char in query):
            return chinese_tokenizer.tokenize_query(query)
        
        # Fallback to original method for non-Chinese text
        # Remove special characters and normalize whitespace
        clean_query = re.sub(r'[^\w\s]', ' ', query.lower())
        
        # Split into terms and filter out very short terms
        # For Chinese text, allow 2-character terms; for other languages, require 3+ characters
        terms = []
        for term in clean_query.split():
            term = term.strip()
            if len(term) > 2:  # 3+ characters for all languages
                terms.append(term)
            elif len(term) == 2 and any('\u4e00' <= char <= '\u9fff' for char in term):  # 2-character Chinese terms
                terms.append(term)
        
        return terms
    
    @staticmethod
    def build_fts_query(terms: List[str]) -> str:
        """
        Build an FTS5 query from fuzzy search terms.
        
        Args:
            terms: List of search terms
            
        Returns:
            FTS5 query string
        """
        if not terms:
            return ""
        
        # Create AND query for more precise matching
        # This will catch documents containing all of the terms
        fts_terms = []
        for term in terms:
            # For Chinese text, use multiple strategies:
            # 1. Exact match
            # 2. Prefix match
            # 3. Character-level prefix matches for better Chinese support
            term_variations = [term, f"{term}*"]
            
            # Add character-level prefixes for Chinese text
            if len(term) > 1 and any('\u4e00' <= char <= '\u9fff' for char in term):
                # For Chinese text, add progressive prefix matches
                # Start from 2 characters to avoid overly broad matches
                for i in range(2, len(term)):
                    prefix = term[:i] + "*"
                    term_variations.append(prefix)
            
            term_group = f"({' OR '.join(term_variations)})"
            fts_terms.append(term_group)
        
        return " AND ".join(fts_terms)
    
    @staticmethod
    def calculate_similarity(query: str, text: str, method: str = "ratio") -> float:
        """
        Calculate similarity between query and text using RapidFuzz.
        
        Args:
            query: Search query
            text: Text to compare against
            method: Similarity method ('ratio', 'partial_ratio', 'token_sort_ratio', 'token_set_ratio')
            
        Returns:
            Similarity score (0-100)
        """
        try:
            from rapidfuzz import fuzz
            
            # Normalize inputs
            query_lower = query.lower()
            text_lower = text.lower()
            
            # Choose similarity method
            if method == "ratio":
                return fuzz.ratio(query_lower, text_lower)
            elif method == "partial_ratio":
                return fuzz.partial_ratio(query_lower, text_lower)
            elif method == "token_sort_ratio":
                return fuzz.token_sort_ratio(query_lower, text_lower)
            elif method == "token_set_ratio":
                return fuzz.token_set_ratio(query_lower, text_lower)
            else:
                return fuzz.ratio(query_lower, text_lower)
                
        except ImportError:
            print("RapidFuzz is not installed. Please install it with: pip install rapidfuzz")
            return 0.0
        except Exception as e:
            print(f"Error calculating similarity: {e}")
            return 0.0
    
    @staticmethod
    def calculate_best_similarity(query: str, text: str) -> Tuple[float, str]:
        """
        Calculate the best similarity score using multiple methods.
        
        Args:
            query: Search query
            text: Text to compare against
            
        Returns:
            Tuple of (best_score, method_used)
        """
        methods = ["ratio", "partial_ratio", "token_sort_ratio", "token_set_ratio"]
        best_score = 0.0
        best_method = "ratio"
        
        for method in methods:
            score = FuzzySearchUtils.calculate_similarity(query, text, method)
            if score > best_score:
                best_score = score
                best_method = method
        
        return best_score, best_method
    
    @staticmethod
    def rank_candidates(query: str, candidates: List[Dict[str, Any]], 
                       content_key: str = "content", 
                       min_score: float = 30.0) -> List[Dict[str, Any]]:
        """
        Rank candidate documents by fuzzy similarity.
        
        Args:
            query: Search query
            candidates: List of candidate documents from FTS5
            content_key: Key containing text content in candidate dicts
            min_score: Minimum similarity score to include
            
        Returns:
            Sorted list of candidates with similarity scores
        """
        if not candidates:
            return []
        
        scored_candidates = []
        
        for candidate in candidates:
            content = candidate.get(content_key, "")
            if not content:
                continue
            
            # Calculate similarity score
            score, method = FuzzySearchUtils.calculate_best_similarity(query, content)
            
            # Only include candidates above minimum threshold
            if score >= min_score:
                # Create new candidate dict with score
                scored_candidate = candidate.copy()
                scored_candidate['fuzzy_score'] = score
                scored_candidate['fuzzy_method'] = method
                scored_candidates.append(scored_candidate)
        
        # Sort by similarity score (descending)
        scored_candidates.sort(key=lambda x: x['fuzzy_score'], reverse=True)
        
        return scored_candidates
    
    @staticmethod
    def highlight_matches(query: str, text: str, max_length: int = 200) -> str:
        """
        Highlight fuzzy matches in text with simple excerpt.
        
        Args:
            query: Search query
            text: Text to highlight
            max_length: Maximum length of highlighted excerpt
            
        Returns:
            Highlighted text excerpt
        """
        # Simple approach: find best substring match
        query_lower = query.lower()
        text_lower = text.lower()
        
        # Find the best position to start excerpt
        best_pos = 0
        best_score = 0
        
        # Try different starting positions
        for i in range(0, len(text_lower) - max_length + 1, 10):
            excerpt = text_lower[i:i + max_length]
            score = FuzzySearchUtils.calculate_similarity(query_lower, excerpt)
            if score > best_score:
                best_score = score
                best_pos = i
        
        # Extract excerpt
        start = max(0, best_pos)
        end = min(len(text), start + max_length)
        excerpt = text[start:end]
        
        # Simple highlighting - wrap query terms in <mark> tags
        query_terms = FuzzySearchUtils.preprocess_query(query)
        highlighted = excerpt
        
        for term in query_terms:
            # Case-insensitive replacement
            pattern = re.compile(re.escape(term), re.IGNORECASE)
            highlighted = pattern.sub(f'<mark>{term}</mark>', highlighted)
        
        # Add ellipsis if needed
        if start > 0:
            highlighted = "..." + highlighted
        if end < len(text):
            highlighted = highlighted + "..."
        
        return highlighted
    
    @staticmethod
    def find_best_matches(query: str, text: str, num_matches: int = 3) -> List[str]:
        """
        Find the best matching excerpts in a text.
        
        Args:
            query: Search query
            text: Text to search in
            num_matches: Number of best excerpts to return
            
        Returns:
            List of best matching excerpts
        """
        if not text or not query:
            return []
        
        # Split text into sentences or paragraphs
        sentences = re.split(r'[.!?]\s+', text)
        
        if not sentences:
            return []
        
        # Score each sentence
        scored_sentences = []
        for sentence in sentences:
            if len(sentence.strip()) < 20:  # Skip very short sentences
                continue
            
            score = FuzzySearchUtils.calculate_similarity(query, sentence)
            if score > 20:  # Only include sentences with some relevance
                scored_sentences.append({
                    'text': sentence.strip(),
                    'score': score
                })
        
        # Sort by score and return top matches
        scored_sentences.sort(key=lambda x: x['score'], reverse=True)
        
        return [item['text'] for item in scored_sentences[:num_matches]]
    
    @staticmethod
    def suggest_corrections(query: str, vocabulary: List[str], max_suggestions: int = 5) -> List[str]:
        """
        Suggest spelling corrections based on a vocabulary.
        
        Args:
            query: Search query to correct
            vocabulary: List of known terms
            max_suggestions: Maximum number of suggestions
            
        Returns:
            List of suggested corrections
        """
        if not vocabulary:
            return []
        
        suggestions = []
        
        # Score each vocabulary term
        for term in vocabulary:
            score = FuzzySearchUtils.calculate_similarity(query, term)
            if score > 60:  # Only suggest close matches
                suggestions.append({
                    'term': term,
                    'score': score
                })
        
        # Sort by score and return top suggestions
        suggestions.sort(key=lambda x: x['score'], reverse=True)
        
        return [item['term'] for item in suggestions[:max_suggestions]]