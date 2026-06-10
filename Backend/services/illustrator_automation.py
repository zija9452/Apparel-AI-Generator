import win32com.client
import pythoncom
import os
import json
import shutil
import logging

logger = logging.getLogger("illustrator-automation")

def update_status(job_dir, message, progress=0, is_ready=False):
    """Updates a status.json file in the job directory."""
    status_path = os.path.join(job_dir, "status.json")
    with open(status_path, "w") as f:
        json.dump({"message": message, "progress": progress, "is_ready": is_ready}, f)

def run_illustrator_automation(job_id, job_dir, plan_data, pattern_ai_path, mockup_ai_path, reference_ai_path=None):
    pythoncom.CoInitialize()
    update_status(job_dir, "Initializing Illustrator...", 10)
    
    try:
        # Ensure all paths are absolute for Illustrator
        job_dir = os.path.abspath(job_dir)
        render_dir = os.path.abspath(os.path.join(job_dir, "renders"))
        os.makedirs(render_dir, exist_ok=True)
        
        plan_json_path = os.path.abspath(os.path.join(job_dir, "production_plan.json"))
        with open(plan_json_path, 'w') as f:
            json.dump(plan_data, f)

        update_status(job_dir, "Connecting to Adobe Illustrator...", 20)
        
        # Targeting Illustrator 2015 specifically as requested
        prog_ids = ["Illustrator.Application.CC.2015", "Illustrator.Application"]
        
        app = None
        import time
        
        for prog_id in prog_ids:
            if app: break
            
            logger.info(f"Attempting to connect to {prog_id}...")
            for attempt in range(3):
                try:
                    # Try to get active object first
                    try:
                        app = win32com.client.GetActiveObject(prog_id)
                        logger.info(f"Connected to active {prog_id}")
                        break
                    except Exception:
                        # If not running, try to Dispatch (which starts it)
                        app = win32com.client.Dispatch(prog_id)
                        logger.info(f"Dispatched new {prog_id}")
                        break
                except Exception as e:
                    logger.warning(f"Attempt {attempt+1} failed for {prog_id}: {e}")
                    if attempt < 2:
                        time.sleep(3)
                    else:
                        continue
        
        if not app:
            raise Exception("Could not connect to any version of Adobe Illustrator. Please ensure it is installed and licensed.")

        # Suppress all alerts and dialogs
        try:
            app.UserInteractionLevel = -1 # aiDontDisplayAlerts
            logger.info("UserInteractionLevel set to Silent mode")
        except Exception as e:
            logger.warning(f"Could not set Silent mode (RPC busy?): {e}")
        
        update_status(job_dir, "Opening Pattern file...", 30)
        
        # Robust opening with path normalization
        abs_pattern_path = os.path.abspath(pattern_ai_path).replace("\\", "/")
        logger.info(f"Opening pattern: {abs_pattern_path}")
        
        doc = None
        import time
        for attempt in range(3):
            try:
                doc = app.Open(abs_pattern_path)
                logger.info("Pattern file opened successfully")
                break
            except Exception as e:
                logger.warning(f"Open attempt {attempt+1} failed: {e}")
                if attempt < 2:
                    time.sleep(2) # Wait and retry
                else:
                    raise e
        
        if not doc:
            raise Exception("Failed to open pattern file after multiple attempts.")
        
        # Get the directory where this file is located
        service_dir = os.path.dirname(os.path.abspath(__file__))
        backend_dir = os.path.dirname(service_dir)
        
        jsx_script_path = os.path.abspath(os.path.join(backend_dir, "scripts", "automate_production.jsx"))
        json_polyfill_path = os.path.abspath(os.path.join(backend_dir, "scripts", "json2.jsx"))
        
        # Ensure arguments use forward slashes and absolute paths
        ref_path_arg = f"'{os.path.abspath(reference_ai_path).replace('\\', '/')}'" if reference_ai_path else "undefined"
        
        script_args = (
            f"var planPath = '{plan_json_path.replace('\\', '/')}'; "
            f"var outputDir = '{render_dir.replace('\\', '/')}'; "
            f"var mockupPath = '{os.path.abspath(mockup_ai_path).replace('\\', '/')}'; "
            f"var jobDir = '{job_dir.replace('\\', '/')}'; "
            f"var jobId = '{job_id}'; "
            f"var referencePath = {ref_path_arg};"
        )
        
        # Read polyfill and main script
        with open(json_polyfill_path, "r") as f:
            json_polyfill = f.read()
        with open(jsx_script_path, "r") as f:
            jsx_code = f.read()
        
        # Create a combined script file for this specific job
        combined_script_path = os.path.abspath(os.path.join(job_dir, "automation_bundle.jsx"))
        with open(combined_script_path, "w") as f:
            f.write("// AI Apparel Automation Bundle\n")
            f.write(json_polyfill + "\n")
            f.write("// Arguments\n")
            f.write(script_args + "\n")
            f.write("// Main Logic\n")
            f.write(jsx_code)

        update_status(job_dir, "Rendering Apparel Parts (this may take a minute)...", 50, False)
        
        # Bulletproof execution: Use $.evalFile to load the bundle
        # This bypasses COM's DoJavaScriptFile which can be flaky with paths/args
        eval_command = f"$.evalFile(new File('{combined_script_path.replace('\\', '/')}'))"
        app.DoJavaScript(eval_command)
        
        # The JSX script will update status to 100% and is_ready: true
        # But we do a final verification and zip generation here
        
        # Wait a moment for files to settle
        time.sleep(2)
        
        update_status(job_dir, "Cleaning up and generating Zip package...", 90, False)
        
        # Copy the plan to the zip folder for reference
        shutil.copy(plan_json_path, os.path.join(render_dir, "production_plan.json"))
        
        doc.Close(2) 
        
        zip_base_name = os.path.join(job_dir, f"order_{job_id}_ready")
        shutil.make_archive(zip_base_name, 'zip', render_dir)
        
        update_status(job_dir, "Production Ready! Ready for download.", 100, True)
        return f"{zip_base_name}.zip"

    except Exception as e:
        logger.exception("Illustrator Automation failed")
        update_status(job_dir, f"Error: {str(e)}", 0, is_ready=False)
        return None
    finally:
        pythoncom.CoUninitialize()
