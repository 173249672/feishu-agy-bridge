import sqlite3
import json
import sys

def get_latest_pending_step(db_path):
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        cursor.execute("SELECT idx, step_type, status, step_payload FROM steps ORDER BY idx DESC LIMIT 1;")
        row = cursor.fetchone()
        conn.close()
        
        if not row:
            return None
            
        idx, step_type, status, payload = row
        if status == 9: # PENDING/WAITING
            if step_type == 138: # ASK_QUESTION
                start_idx = payload.find(b'{"questions":')
                if start_idx != -1:
                    brace_count = 0
                    in_quote = False
                    escape = False
                    end_idx = -1
                    for i in range(start_idx, len(payload)):
                        char = chr(payload[i])
                        if in_quote:
                            if escape:
                                escape = False
                            elif char == '\\':
                                escape = True
                            elif char == '"':
                                in_quote = False
                        else:
                            if char == '"':
                                in_quote = True
                            elif char == '{':
                                brace_count += 1
                            elif char == '}':
                                brace_count -= 1
                                if brace_count == 0:
                                    end_idx = i + 1
                                    break
                    if end_idx != -1:
                        json_bytes = payload[start_idx:end_idx]
                        return {
                            "idx": idx,
                            "type": "question",
                            "question_data": json.loads(json_bytes.decode('utf-8'))
                        }
            elif step_type in (8, 21): # TOOL_CALL/RUN_COMMAND/PERMISSION_REQUEST
                start_idx = payload.find(b'{"')
                if start_idx != -1:
                    brace_count = 0
                    in_quote = False
                    escape = False
                    end_idx = -1
                    for i in range(start_idx, len(payload)):
                        char = chr(payload[i])
                        if in_quote:
                            if escape:
                                escape = False
                            elif char == '\\':
                                escape = True
                            elif char == '"':
                                in_quote = False
                        else:
                            if char == '"':
                                in_quote = True
                            elif char == '{':
                                brace_count += 1
                            elif char == '}':
                                brace_count -= 1
                                if brace_count == 0:
                                    end_idx = i + 1
                                    break
                    if end_idx != -1:
                        try:
                            json_bytes = payload[start_idx:end_idx]
                            tool_data = json.loads(json_bytes.decode('utf-8'))
                            reason = tool_data.get('toolAction') or tool_data.get('toolSummary') or "Requesting tool permission"
                            if step_type == 21 and tool_data.get('CommandLine'):
                                reason = f"Proposing command: {tool_data['CommandLine']}"
                            return {
                                "idx": idx,
                                "type": "permission",
                                "reason": reason
                            }
                        except Exception:
                            pass
                return {
                    "idx": idx,
                    "type": "permission",
                    "reason": "Proposing command" if step_type == 21 else "Requesting tool permission"
                }

        # Detect API error steps (status=3=DONE, step_type=17=MODEL_RESPONSE with error payload)
        # These are written even when quota is exhausted and the process is still "running"
        if step_type == 17 and status == 3:
            payload_text = payload.decode('utf-8', errors='replace')
            if 'RESOURCE_EXHAUSTED' in payload_text or 'Individual quota reached' in payload_text:
                import re
                # Extract clean human-readable message (stop at protobuf delimiters)
                quota_match = re.search(r'Individual quota reached[^.\n\x00\x12]*\.?[^.\n\x00\x12]*', payload_text)
                resource_match = re.search(r'RESOURCE_EXHAUSTED \(code \d+\): ([^\n\x00\x12]+)', payload_text)
                if quota_match:
                    error_text = quota_match.group(0).strip().rstrip('\x12').strip()
                elif resource_match:
                    error_text = resource_match.group(1).strip()
                else:
                    error_text = "API quota exhausted (429)"
                return {
                    "idx": idx,
                    "type": "error",
                    "message": error_text
                }


        return None
    except Exception as e:
        return {"error": str(e)}


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(1)
    db_path = sys.argv[1]
    res = get_latest_pending_step(db_path)
    if res:
        print(json.dumps(res))
    else:
        print("null")
