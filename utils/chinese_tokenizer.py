"""
Chinese text tokenization using jieba for better search performance.
"""

from typing import List, Set
import jieba
import jieba.analyse


class ChineseTokenizer:
    """
    Chinese text tokenizer using jieba for improved search capabilities.
    """
    
    def __init__(self):
        """Initialize the tokenizer."""
        # Load user dictionary if exists
        self._load_custom_dict()
    
    def _load_custom_dict(self):
        """Load custom dictionary for domain-specific terms."""
        # Add common technical terms
        custom_words = [
            '人工智能', '机器学习', '深度学习', '神经网络',
            '数据挖掘', '自然语言处理', '计算机视觉',
            '云计算', '大数据', '区块链', '物联网',
            '中水电力', '华为技术', '阿里巴巴', '腾讯科技'
        ]
        
        for word in custom_words:
            jieba.add_word(word)
    
    def tokenize_query(self, query: str) -> List[str]:
        """
        Tokenize search query for better matching.
        
        Args:
            query: Search query string
            
        Returns:
            List of tokens
        """
        # Use search mode for query tokenization
        tokens = list(jieba.cut_for_search(query))
        
        # Filter out single characters and stopwords
        filtered_tokens = []
        stopwords = {'的', '了', '在', '是', '和', '与', '或', '等', '及'}
        
        for token in tokens:
            token = token.strip()
            if len(token) > 1 and token not in stopwords:
                filtered_tokens.append(token)
        
        return filtered_tokens
    
    def tokenize_document(self, text: str) -> List[str]:
        """
        Tokenize document content for indexing.
        
        Args:
            text: Document content
            
        Returns:
            List of tokens
        """
        # Use precise mode for document indexing
        tokens = list(jieba.cut(text, cut_all=False))
        
        # Filter and clean tokens
        filtered_tokens = []
        for token in tokens:
            token = token.strip()
            if len(token) > 1 and not token.isspace():
                filtered_tokens.append(token)
        
        return filtered_tokens
    
    def extract_keywords(self, text: str, topK: int = 20) -> List[str]:
        """
        Extract keywords from text using TF-IDF.
        
        Args:
            text: Input text
            topK: Number of keywords to extract
            
        Returns:
            List of keywords
        """
        return jieba.analyse.extract_tags(text, topK=topK)
    
    def get_expanded_terms(self, query: str) -> Set[str]:
        """
        Get expanded search terms including synonyms and related terms.
        
        Args:
            query: Original query
            
        Returns:
            Set of expanded terms
        """
        terms = set()
        
        # Original tokens
        tokens = self.tokenize_query(query)
        terms.update(tokens)
        
        # Add partial tokens for better matching
        for token in tokens:
            if len(token) > 2:
                # Add progressive prefixes
                for i in range(2, len(token)):
                    terms.add(token[:i])
        
        return terms


# Global tokenizer instance
chinese_tokenizer = ChineseTokenizer()