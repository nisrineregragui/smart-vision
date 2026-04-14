import torch
import torchvision.transforms as transforms
import timm
from PIL import Image
from io import BytesIO

CLASSES = ["Blast", "Brown Rust", "Healthy", "Septoria", "Yellow Rust"]
device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')

#preprocessing defined by context: 224x224, imagenet stats
preprocess = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
])

#load the trained model EfficientNet-B0
model = None
try:
    print("Loading custom trained model using timm (efficientnet_b0)...")
    model = timm.create_model('efficientnet_b0', num_classes=5)
    model.load_state_dict(torch.load('best_model.pth', map_location=device, weights_only=True), strict=True)
    model.to(device)
    model.eval()
    print("Model loaded successfully!")
except Exception as e:
    print(f"Could not load custom model weights: {e}")

def predict_image(image_bytes: bytes) -> dict:
    """
    Process an image and return the prediction, confidence, and warning flag.
    """
    if model is None:
        raise Exception("Model failed to load on server strictly.")
        
    image = Image.open(BytesIO(image_bytes)).convert('RGB')
    tensor = preprocess(image).unsqueeze(0).to(device)

    with torch.no_grad():
        logits = model(tensor)
        probabilities = torch.nn.functional.softmax(logits, dim=1)[0]
        confidence, predicted_idx = torch.max(probabilities, 0)
        
        pred_class = CLASSES[predicted_idx.item()]
        conf_val = float(confidence.item())
        
        #ux warning threshold
        warning = conf_val < 0.70
        
        return {
            "prediction": pred_class,
            "confidence": conf_val,
            "warning": warning
        }
