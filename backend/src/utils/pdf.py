"""
PDF Builder - Pure Python PDF writer to compile executive PDF reports without external dependencies
"""

import datetime
from typing import List, Dict, Any, Tuple


class PDFBuilder:
    def __init__(self):
        self.objects = []
        self.page_contents = []  # List of streams per page
        
    def _escape(self, text: str) -> str:
        """Escape special characters in PDF strings"""
        return text.replace("(", "\\(").replace(")", "\\)")

    def add_page(self, stream_commands: List[str]):
        """Add a page with specified stream commands (PDF graphics/text commands)"""
        self.page_contents.append(stream_commands)

    def build(self) -> bytes:
        # Build objects list
        # Obj 1: Catalog
        # Obj 2: Pages (parent node)
        # Obj 3..N: Page nodes
        # Obj N+1..M: Content streams for pages
        # Obj M+1: Helvetica Font
        # Obj M+2: Helvetica-Bold Font
        
        objects_to_write = []
        
        # We'll use 1-based indexing for objects.
        # Keep track of count
        obj_count = 0
        
        # Define place-holders
        catalog_id = 1
        pages_id = 2
        
        num_pages = len(self.page_contents)
        page_ids = [3 + i for i in range(num_pages)]
        content_ids = [3 + num_pages + i for i in range(num_pages)]
        
        font_reg_id = 3 + 2 * num_pages
        font_bold_id = 4 + 2 * num_pages
        
        # 1. Catalog
        objects_to_write.append(f"<< /Type /Catalog /Pages {pages_id} 0 R >>".encode("ascii"))
        
        # 2. Pages Parent
        kids_str = " ".join([f"{pid} 0 R" for pid in page_ids])
        objects_to_write.append(
            f"<< /Type /Pages /Kids [{kids_str}] /Count {num_pages} >>".encode("ascii")
        )
        
        # 3. Pages
        for i in range(num_pages):
            objects_to_write.append(
                f"<< /Type /Page /Parent {pages_id} 0 R /MediaBox [0 0 612 792] /Contents {content_ids[i]} 0 R /Resources << /Font << /F1 {font_reg_id} 0 R /F2 {font_bold_id} 0 R >> >> >>".encode("ascii")
            )
            
        # 4. Content streams
        for i in range(num_pages):
            stream_body = "\n".join(self.page_contents[i]).encode("utf-8")
            stream_header = f"<< /Length {len(stream_body)} >>\nstream\n".encode("ascii")
            stream_footer = "\nendstream".encode("ascii")
            objects_to_write.append(stream_header + stream_body + stream_footer)
            
        # 5. Fonts
        objects_to_write.append(
            f"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>".encode("ascii")
        )
        objects_to_write.append(
            f"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>".encode("ascii")
        )
        
        # Generate the final PDF byte array with offsets
        pdf_bytes = b"%PDF-1.4\n"
        offsets = {}
        
        for idx, obj in enumerate(objects_to_write):
            obj_num = idx + 1
            offsets[obj_num] = len(pdf_bytes)
            pdf_bytes += f"{obj_num} 0 obj\n".encode("ascii") + obj + b"\nendobj\n"
            
        xref_start = len(pdf_bytes)
        pdf_bytes += f"xref\n0 {len(objects_to_write) + 1}\n0000000000 65535 f \n".encode("ascii")
        
        for obj_num in range(1, len(objects_to_write) + 1):
            offset_str = f"{offsets[obj_num]:010d} 00000 n \n"
            pdf_bytes += offset_str.encode("ascii")
            
        pdf_bytes += f"trailer\n<< /Size {len(objects_to_write) + 1} /Root {catalog_id} 0 R >>\nstartxref\n{xref_start}\n%%EOF\n".encode("ascii")
        return pdf_bytes


def generate_executive_report_pdf(session_data: Dict[str, Any]) -> bytes:
    """
    Generate a styled CFO-friendly executive report PDF bytes
    """
    builder = PDFBuilder()
    
    # Page 1: Executive Summary
    page1 = []
    
    # Helper functions to add commands
    def draw_rect(x: float, y: float, w: float, h: float, color: Tuple[float, float, float]):
        # color: RGB tuple 0.0 - 1.0
        page1.append(f"{color[0]} {color[1]} {color[2]} rg")
        page1.append(f"{x} {y} {w} {h} re f")

    def draw_text(text: str, x: float, y: float, font: str = "/F1", size: float = 10, color: Tuple[float, float, float] = (0, 0, 0)):
        escaped = builder._escape(text)
        page1.append("BT")
        page1.append(f"{color[0]} {color[1]} {color[2]} rg")
        page1.append(f"{font} {size} Tf")
        page1.append(f"{x} {y} Td")
        page1.append(f"({escaped}) Tj")
        page1.append("ET")

    def draw_line(x1: float, y1: float, x2: float, y2: float, width: float = 1, color: Tuple[float, float, float] = (0.7, 0.7, 0.7)):
        page1.append(f"{width} w")
        page1.append(f"{color[0]} {color[1]} {color[2]} RG")
        page1.append(f"{x1} {y1} m {x2} {y2} l S")

    # Header section background (Dark Purple theme matching Aurex styling)
    draw_rect(0, 680, 612, 112, (0.09, 0.04, 0.22)) # Deep Aurex Purple
    
    # Title & Subtitle
    draw_text("A U R E X   E X E C U T I V E   R E P O R T", 40, 740, "/F2", 18, (1, 1, 1))
    draw_text("AI Cost Auditing & Optimization Summary", 40, 715, "/F1", 12, (0.8, 0.8, 0.8))
    
    # Report Metadata
    now_str = datetime.datetime.now().strftime("%B %d, %Y")
    draw_text(f"Generated: {now_str}", 440, 740, "/F1", 10, (1, 1, 1))
    draw_text(f"Session ID: {session_data.get('id', 'N/A')[:18]}", 440, 715, "/F1", 9, (0.8, 0.8, 0.8))
    
    # Divider line
    draw_line(40, 650, 572, 650, 2, (0.4, 0.2, 0.6))
    
    # Details Grid
    draw_text("Company Details", 40, 620, "/F2", 12, (0.09, 0.04, 0.22))
    draw_text(f"Company: {session_data.get('company_name', 'N/A')}", 40, 600, "/F1", 10)
    draw_text(f"Auditor Name: {session_data.get('user_name', 'N/A')}", 40, 580, "/F1", 10)
    draw_text(f"Email Contact: {session_data.get('email', 'N/A')}", 40, 560, "/F1", 10)
    
    # KPI Grid Boxes (Draw colored boxes with rounded background illusion)
    # Box 1: Credit Score (Light teal background or warnings)
    score = session_data.get("credit_score", 100)
    score_color = (0.1, 0.6, 0.4) if score >= 80 else ((0.8, 0.5, 0.1) if score >= 50 else (0.8, 0.1, 0.1))
    
    draw_rect(40, 440, 160, 90, (0.95, 0.95, 0.95))
    draw_line(40, 530, 200, 530, 3, score_color)
    draw_text("TOKEN CREDIT SCORE", 50, 510, "/F2", 8, (0.4, 0.4, 0.4))
    draw_text(f"{score} / 100", 50, 470, "/F2", 24, score_color)
    
    # Box 2: Total Cost
    draw_rect(220, 440, 160, 90, (0.95, 0.95, 0.95))
    draw_line(220, 530, 380, 530, 3, (0.4, 0.2, 0.6))
    draw_text("TOTAL TRACKED SPEND", 230, 510, "/F2", 8, (0.4, 0.4, 0.4))
    draw_text(f"${session_data.get('total_cost', 0.0):,.2f}", 230, 470, "/F2", 20, (0.09, 0.04, 0.22))
    
    # Box 3: Wasted Cost & Waste %
    draw_rect(400, 440, 172, 90, (0.95, 0.95, 0.95))
    draw_line(400, 530, 572, 530, 3, (0.8, 0.1, 0.1))
    draw_text("WASTED COST (WASTE %)", 410, 510, "/F2", 8, (0.4, 0.4, 0.4))
    draw_text(f"${session_data.get('wasted_cost', 0.0):,.2f}", 410, 470, "/F2", 20, (0.8, 0.1, 0.1))
    draw_text(f"({session_data.get('waste_percentage', 0.0):.1f}% of total)", 410, 452, "/F1", 9, (0.5, 0.5, 0.5))
    
    # Annualized Savings Banner
    draw_rect(40, 370, 532, 50, (0.9, 0.95, 0.92)) # soft green
    draw_text("PROJECTED ANNUAL SAVINGS RUN-RATE", 55, 402, "/F2", 9, (0.1, 0.5, 0.2))
    exec_sum = (session_data.get("analysis_results") or {}).get("executive_summary") or {}
    annual_savings = exec_sum.get("annual_savings_projection", session_data.get("wasted_cost", 0.0) * 52)
    draw_text(f"${annual_savings:,.2f} / year", 55, 380, "/F2", 16, (0.1, 0.5, 0.2))
    
    # Recommendations Header
    draw_text("Key Cost Optimization Recommendations", 40, 330, "/F2", 12, (0.09, 0.04, 0.22))
    draw_line(40, 320, 572, 320, 1, (0.8, 0.8, 0.8))
    
    # List top issues
    issues = (session_data.get("analysis_results") or {}).get("top_issues") or []
    if not issues:
        # Create a mock default issue if empty
        issues = [
            {
                "title": "Expensive Model Misuse",
                "severity": "HIGH",
                "weekly_cost": session_data.get("wasted_cost", 0.0),
                "description": "Standardize on lower cost models (e.g. GPT-4o-mini, Gemini Flash) for simpler tasks."
            }
        ]
        
    y_pos = 290
    for issue in issues[:4]: # Top 4 issues
        title = issue.get("title", "Optimization Recommendation")
        severity = issue.get("severity", "MEDIUM")
        cost = issue.get("weekly_cost", 0.0)
        desc = issue.get("description", "Optimize token spend by patching model routes.")
        
        # Draw bullet and issue header
        draw_rect(45, y_pos + 2, 6, 6, (0.4, 0.2, 0.6))
        draw_text(f"{title} ({severity})", 60, y_pos, "/F2", 11, (0.09, 0.04, 0.22))
        draw_text(f"Impact: ${cost:.2f} / wk", 460, y_pos, "/F2", 10, (0.8, 0.1, 0.1))
        
        # Wrap description text if too long (rough slicing)
        if len(desc) > 85:
            desc1 = desc[:85]
            desc2 = desc[85:]
            draw_text(desc1, 60, y_pos - 15, "/F1", 9, (0.3, 0.3, 0.3))
            draw_text(desc2, 60, y_pos - 27, "/F1", 9, (0.3, 0.3, 0.3))
            y_pos -= 45
        else:
            draw_text(desc, 60, y_pos - 15, "/F1", 9, (0.3, 0.3, 0.3))
            y_pos -= 35
            
    # Footer
    draw_line(40, 50, 572, 50, 1, (0.8, 0.8, 0.8))
    draw_text("Confidential Report - Aurex AI Cost Control Platform", 40, 35, "/F1", 8, (0.5, 0.5, 0.5))
    draw_text("aurex.dev", 530, 35, "/F1", 8, (0.5, 0.5, 0.5))
    
    builder.add_page(page1)
    return builder.build()
