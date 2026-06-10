from fastapi import FastAPI, HTTPException, UploadFile, File, Form, BackgroundTasks
from pydantic import BaseModel, Field
from typing import Optional, List, Any, Dict
from dotenv import load_dotenv
import os
import json
import logging
import uuid
from fastapi.middleware.cors import CORSMiddleware

# Internal services
from services.excel_service import parse_order_excel
from services.illustrator_automation import run_illustrator_automation

# OpenAI Agents SDK imports
from agents import (
    Agent,
    AgentOutputSchema,
    AsyncOpenAI,
    OpenAIChatCompletionsModel,
    Runner,
    SQLiteSession,
    set_tracing_disabled,
)

load_dotenv()
set_tracing_disabled(disabled=True)

# Configuration
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    raise RuntimeError("GEMINI_API_KEY not set in environment")

DB_PATH = "apparel_sessions.db"
UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

# Logger setup
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("apparel-orchestrator")

# Model configuration
external_client = AsyncOpenAI(
    api_key=GEMINI_API_KEY,
    base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
    timeout=120.0,
)

model = OpenAIChatCompletionsModel(
    model="gemini-2.5-flash",
    openai_client=external_client,
)

# --- Output Schemas ---
class TextReplacement(BaseModel):
    layer_name: str
    new_value: str

class ArtboardPlan(BaseModel):
    part_name: str
    size: str
    quantity: int = 1 
    text_replacements: List[TextReplacement]

class SizeProductionGroup(BaseModel):
    size: str
    items: List[ArtboardPlan]

class CMYKColor(BaseModel):
    c: float
    m: float
    y: float
    k: float

class ColorMappingEntry(BaseModel):
    swatch_name: str
    color: CMYKColor

class GlobalGenerationPlan(BaseModel):
    job_id: str
    total_sizes: int
    production_groups: List[SizeProductionGroup]
    color_mapping: List[ColorMappingEntry]
    output_format: str 
    validation_notes: str

# --- Agent Definition ---
ApparelOrchestratorAgent = Agent(
    name="Apparel Orchestrator Agent",
    instructions=(
        "You are a Professional Apparel Production Manager. Your goal is to generate a literal production plan from the provided data.\n\n"
        "1. SLEEVE LOGIC (CRITICAL):\n"
        "   - Prioritize 'user_instructions' (Special Instructions) for sleeve length. Keywords: 'Full', 'Long', 'Half', 'Short'.\n"
        "   - If 'user_instructions' mention 'Full' or 'Long', use part_name: 'sleeve-long'.\n"
        "   - If 'user_instructions' mention 'Half' or 'Short', use part_name: 'sleeve-short'.\n"
        "   - If not mentioned in instructions, analyze the mockup image. If still unclear, DEFAULT to 'sleeve-short'.\n\n"
        "2. COLOR LOGIC (CRITICAL):\n"
        "   - ONLY populate 'color_mapping' if explicit CMYK values are provided in the Excel file.\n"
        "   - DO NOT estimate or invent CMYK values from the mockup image. If Excel has no color data, leave 'color_mapping' as an empty list [].\n"
        "   - The automation script will automatically use default RGB values if the list is empty.\n\n"
        "3. ACCESSORY LOGIC (SINGLE INSTANCE):\n"
        "   - Include 'twill-tape' and 'tukdi' EXACTLY ONCE for the entire order, regardless of total quantity.\n"
        "   - Place them in a final SizeProductionGroup with size: 'Universal'.\n"
        "   - Ensure their part_name is exactly 'twill-tape' and 'tukdi'.\n\n"
        "4. DE-DUPLICATION & SHARED PARTS (CRITICAL):\n"
        "   - For each size group, do NOT repeat parts that are identical across all items.\n"
        "   - If 'back', 'neck', or 'sleeve' have NO individual personalization (no unique name/number/logo on those parts), output them ONLY ONCE per size group.\n"
        "   - SLEEVE QUANTITY RULE: Set quantity: 1 if both sleeves are identical. Set quantity: 2 ONLY if you need to place different LOGOS, NAMES, or NUMBERS on each sleeve (Left vs Right).\n"
        "   - Only output 'front' (or whichever part is personalized) for every unique item in the Excel list.\n"
        "   - Example: For 10 Large jerseys with different front numbers but identical sleeves: Output 10 'front' parts, 1 'back' part, 1 'neck' part, and 1 'sleeve' part (quantity: 1).\n\n"
        "5. TEXT REPLACEMENTS & STRICTION:\n"
        "   - Use 'NAME', 'NUMBER', 'LOGO' for text_replacements.\n"
        "   - STRICTION: DO NOT use 'Gemini' or any AI-related words as placeholder values. If a field is empty in Excel, leave it as an empty string \"\".\n"
        "   - Ensure 'NUMBER' is exactly as provided in Excel (e.g., \"01\", \"07\")."
    ),
    model=model,
    output_type=AgentOutputSchema(GlobalGenerationPlan, strict_json_schema=False),
)

app = FastAPI(title="AI Apparel Orchestrator API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

@app.post("/jobs/upload")
async def upload_files(
    background_tasks: BackgroundTasks,
    excel_file: UploadFile = File(...),
    mockup_ai: UploadFile = File(...),
    pattern_ai: UploadFile = File(...),
    reference_ai: UploadFile = File(...),
    mockup_image: Optional[UploadFile] = File(None),
    fonts: List[UploadFile] = File([]),
    user_instructions: str = Form("Standard production rules apply.")
):
    job_id = str(uuid.uuid4())
    job_dir = os.path.join(UPLOAD_DIR, job_id)
    os.makedirs(job_dir, exist_ok=True)
    
    # Save files to disk
    pattern_path = os.path.join(job_dir, "pattern.ai")
    with open(pattern_path, "wb") as f: f.write(await pattern_ai.read())
    
    mockup_path = os.path.join(job_dir, "mockup.ai")
    with open(mockup_path, "wb") as f: f.write(await mockup_ai.read())

    reference_path = os.path.join(job_dir, "reference.ai")
    with open(reference_path, "wb") as f: f.write(await reference_ai.read())

    # Save fonts to 'Document Fonts' folder
    if fonts:
        fonts_dir = os.path.join(job_dir, "Document Fonts")
        os.makedirs(fonts_dir, exist_ok=True)
        for font in fonts:
            if font.filename:
                # Filter out empty files or bad filenames
                font_path = os.path.join(fonts_dir, font.filename)
                with open(font_path, "wb") as f:
                    f.write(await font.read())
    
    try:
        excel_content = await excel_file.read()
        excel_data = parse_order_excel(excel_content)
        session = SQLiteSession(f"job_{job_id}", DB_PATH)
        
        prompt_text = f"Job ID: {job_id}\nSummary: {excel_data['summary']}\nInstructions: {user_instructions}"
        
        input_content = [prompt_text]
        if mockup_image:
            import base64
            img_data = await mockup_image.read()
            input_content = [{"role": "user", "content": [
                {"type": "text", "text": prompt_text},
                {"type": "image_url", "image_url": {"url": f"data:{mockup_image.content_type};base64,{base64.b64encode(img_data).decode()}"}}
            ]}]

        result = await Runner.run(ApparelOrchestratorAgent, input=input_content, session=session)
        final_plan = result.final_output
        
        # Populate color mapping
        if excel_data['color_mapping']:
            final_plan.color_mapping = [ColorMappingEntry(swatch_name=k, color=CMYKColor(**v)) for k, v in excel_data['color_mapping'].items()]

        # Trigger Illustrator Automation in Background
        background_tasks.add_task(
            run_illustrator_automation, 
            job_id, job_dir, final_plan.dict(), pattern_path, mockup_path, reference_path
        )

        return {
            "job_id": job_id,
            "status": "processing_started",
            "production_plan": final_plan,
            "download_url": f"/jobs/download/{job_id}"
        }

    except Exception as e:
        logger.exception("Processing failed")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/jobs/status/{job_id}")
async def get_job_status(job_id: str):
    status_path = os.path.join(UPLOAD_DIR, job_id, "status.json")
    if os.path.exists(status_path):
        with open(status_path, "r") as f:
            return json.load(f)
    return {"message": "Initializing...", "progress": 0, "is_ready": False}

@app.get("/jobs/download/{job_id}")
async def download_job(job_id: str):
    zip_path = os.path.join(UPLOAD_DIR, job_id, f"order_{job_id}_ready.zip")
    if os.path.exists(zip_path):
        from fastapi.responses import FileResponse
        return FileResponse(zip_path, filename=f"order_{job_id}_ready.zip")
    return {"status": "processing", "message": "Zip file not ready yet. Please refresh."}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
