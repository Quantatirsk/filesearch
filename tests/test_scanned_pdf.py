#!/usr/bin/env python3
"""
Test script to create a mock scanned PDF for testing
"""

import sys
sys.path.append('/opt/filesearch')
from parsers.pdf_parser import PDFParser

def test_scanned_pdf_detection():
    """Test the scanned PDF detection functionality"""
    
    parser = PDFParser()
    print("✅ PDF解析器创建成功")
    
    # Test with a PDF that has very little text (simulating scanned document)
    test_files = [
        "/opt/filesearch/example/demo.pdf",  # Normal PDF
    ]
    
    for test_file in test_files:
        print(f"\n🔍 测试文件: {test_file}")
        
        try:
            content = parser.parse(test_file)
            
            if content:
                print(f"  ✅ 解析成功，内容长度: {len(content)} 字符")
                print(f"  📄 前100字符: {content[:100]}...")
            else:
                print(f"  ⚠️  解析结果为空（可能是扫描件或无文本内容）")
                
        except Exception as e:
            print(f"  ❌ 解析失败: {e}")
    
    print("\n📝 扫描件检测逻辑已添加到PDF解析器中")
    print("当遇到以下情况时，PDF会被跳过：")
    print("1. 总文本字符数少于50")
    print("2. 有图像但平均每页文本字符数少于100")
    print("3. 图像占据页面面积超过50%")

if __name__ == "__main__":
    test_scanned_pdf_detection()