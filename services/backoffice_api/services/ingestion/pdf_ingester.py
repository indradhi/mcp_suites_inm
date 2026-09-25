import os
import logging
from typing import List, Dict, Any
import pdfplumber
import pytesseract
from pdf2image import convert_from_path
from PIL import Image
import cv2
import numpy as np

logger = logging.getLogger(__name__)

class PDFIngester:
    """
    Extracts text from PDFs.
    If a page or document contains scanned images or no extractable text,
    it automatically triggers Tesseract OCR on the page images.
    """

    def __init__(self, ocr_threshold_chars: int = 40):
        self.ocr_threshold_chars = ocr_threshold_chars

    def _preprocess_image_for_ocr(self, pil_img: Image.Image) -> np.ndarray:
        """
        Applies image processing techniques to improve OCR accuracy.
        Converts to grayscale and applies adaptive thresholding.
        """
        # Convert PIL image to OpenCV format
        open_cv_image = np.array(pil_img)
        
        # Handle RGB to Grayscale
        if len(open_cv_image.shape) == 3 and open_cv_image.shape[2] == 3:
            # Convert RGB to BGR for standard OpenCV processing (optional but good practice)
            open_cv_image = open_cv_image[:, :, ::-1].copy()
            gray = cv2.cvtColor(open_cv_image, cv2.COLOR_BGR2GRAY)
        elif len(open_cv_image.shape) == 2:
            gray = open_cv_image
        else:
            gray = cv2.cvtColor(open_cv_image, cv2.COLOR_BGRA2GRAY)

        # Apply adaptive thresholding to get a cleaner binary image
        thresh = cv2.adaptiveThreshold(
            gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 11, 2
        )
        return thresh

    def extract_text(self, file_path: str) -> List[Dict[str, Any]]:
        results = []
        try:
            with pdfplumber.open(file_path) as pdf:
                total_pages = len(pdf.pages)
                logger.info(f"Processing PDF '{file_path}' ({total_pages} pages)...")

                for page_num, page in enumerate(pdf.pages, start=1):
                    page_text = page.extract_text() or ""
                    clean_text = page_text.strip()
                    is_ocr = False

                    # If text extracted is below threshold, the page is likely an image/scanned
                    if len(clean_text) < self.ocr_threshold_chars:
                        logger.info(f"Page {page_num} has insufficient text ({len(clean_text)} chars). Running OCR...")
                        try:
                            # Convert this specific page to image
                            images = convert_from_path(
                                file_path,
                                first_page=page_num,
                                last_page=page_num,
                                dpi=200
                            )
                            if images:
                                # Image Processing (Pre-processing for OCR)
                                processed_img = self._preprocess_image_for_ocr(images[0])
                                
                                # OCR on processed image
                                ocr_text = pytesseract.image_to_string(processed_img)
                                if len(ocr_text.strip()) > len(clean_text):
                                    clean_text = ocr_text.strip()
                                    is_ocr = True
                        except Exception as ocr_err:
                            logger.warning(f"OCR failed for page {page_num}: {ocr_err}")

                    if clean_text:
                        results.append({
                            "page": page_num,
                            "text": clean_text,
                            "is_ocr": is_ocr,
                            "metadata": {
                                "source_file": os.path.basename(file_path),
                                "page": page_num,
                                "total_pages": total_pages,
                                "ocr_applied": is_ocr
                            }
                        })

        except Exception as e:
            logger.error(f"Failed to extract text from PDF {file_path}: {e}")
            raise

        return results

pdf_ingester = PDFIngester()
