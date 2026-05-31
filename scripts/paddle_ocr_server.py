#!/usr/bin/env python3
# -*- coding: utf-8 -*-
#命令行启动服务，需进入脚本所在文件夹：cd /d D:\MyFile\Work\chatask\public\script
#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PaddleOCR 本地 HTTP 服务
启动方式: python paddle_ocr_server.py
依赖安装:
    pip install paddleocr flask
    pip install paddlepaddle          # CPU 版本
    # 或 pip install paddlepaddle-gpu  # 如有 NVIDIA GPU
"""
import base64
import io
import logging
import sys
import numpy as np
from PIL import Image
from flask import Flask, request, jsonify

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger(__name__)

app = Flask(__name__)

# ==================== 初始化 PaddleOCR ====================
print("[PaddleOCR Server] 正在加载模型，首次启动约需 10-30 秒...")
try:
    from paddleocr import PaddleOCR

    ocr = PaddleOCR(
        use_angle_cls=True,       # 方向分类（处理旋转文字）
        lang='ch',                # 中文模型
        show_log=False,           # 关闭冗余日志
        use_gpu=False,            # CPU 推理（如需 GPU 改为 True）
        det_db_thresh=0.3,        # 检测阈值（降低以提高召回率）
        det_db_box_thresh=0.5,
        rec_batch_num=1,          # 单张图 batch（避免内存占用过高）
        max_text_length=100
    )
    print("[PaddleOCR Server] ✅ 模型加载完成，服务启动在 http://127.0.0.1:5000")
except Exception as e:
    print(f"[PaddleOCR Server] ❌ 模型加载失败: {e}")
    sys.exit(1)


def base64_to_numpy(base64_str):
    """base64 -> numpy array (RGB)"""
    image_bytes = base64.b64decode(base64_str)
    image = Image.open(io.BytesIO(image_bytes))
    if image.mode != 'RGB':
        image = image.convert('RGB')
    return np.array(image)


@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok', 'service': 'paddleocr'})


@app.route('/ocr', methods=['POST'])
def ocr_image():
    """
    Request:  { "image": "base64string" }
    Response: { "success": true, "text": "...", "avg_confidence": 0.95, "details": [...] }
    """
    try:
        data = request.get_json(force=True)
        image_base64 = data.get('image')
        if not image_base64:
            return jsonify({'success': False, 'error': '缺少 image 字段'}), 400

        img_array = base64_to_numpy(image_base64)
        result = ocr.ocr(img_array, cls=True)

        texts = []
        confidences = []
        details = []

        if result and result[0]:
            for line in result[0]:
                box = line[0]
                text, confidence = line[1]
                texts.append(text)
                confidences.append(float(confidence))
                details.append({
                    'text': text,
                    'confidence': round(float(confidence), 4),
                    'box': box
                })

        avg_confidence = sum(confidences) / len(confidences) if confidences else 0
        logger.info(f"OCR 成功: {len(texts)} 行, 平均置信度 {avg_confidence:.3f}")

        return jsonify({
            'success': True,
            'text': ' '.join(texts),
            'details': details,
            'avg_confidence': round(avg_confidence, 4)
        })

    except Exception as e:
        logger.error(f"OCR 异常: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


if __name__ == '__main__':
    # threaded=True 允许并发请求接入，但 OCR 计算本身是单线程顺序执行的
    app.run(host='127.0.0.1', port=5000, threaded=True, debug=False)