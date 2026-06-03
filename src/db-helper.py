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
            elif step_type == 8: # TOOL_CALL/PERMISSION_REQUEST
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
                    "reason": "Requesting tool permission"
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
