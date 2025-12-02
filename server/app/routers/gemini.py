import json
import re
from datetime import datetime, timedelta

import google.generativeai as genai
from fastapi import APIRouter, HTTPException, status

from ..config import get_settings
from ..schemas import AnalysisPayload, ChatPayload, ParsePayload

settings = get_settings()

router = APIRouter(prefix='/gemini', tags=['gemini'])

if settings.gemini_api_key:
  genai.configure(api_key=settings.gemini_api_key)
  gemini_model = genai.GenerativeModel(settings.gemini_model)
else:
  gemini_model = None


def ensure_model():
  if not gemini_model:
    raise HTTPException(
      status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
      detail='GEMINI_API_KEY is not configured; Gemini API unavailable.',
    )
  return gemini_model


def clean_json_string(text: str) -> str:
  return text.replace('```json', '').replace('```', '').strip()


@router.post('/analyze')
def analyze(payload: AnalysisPayload):
  model = ensure_model()
  prompt_context = {
    'petProfile': payload.pet,
    'recentBehaviors': payload.logs[:20],
    'recentExpenses': payload.expenses[:10],
  }
  lang_instruction = (
    'CRITICAL: Return summary/risk/suggestion text in Simplified Chinese. JSON keys stay English.'
    if payload.language == 'zh'
    else 'Return the response in English.'
  )
  prompt = (
    'Analyze this pet data. Provide a brief health summary, potential risks, and suggestions.\n'
    f'Data: {prompt_context}\n\n'
    f'{lang_instruction}'
  )
  response = model.generate_content(
    prompt,
    generation_config=genai.GenerationConfig(response_mime_type='application/json'),
  )
  text = response.text
  if not text:
    raise HTTPException(status_code=500, detail='AI returned empty response')
  try:
    data = json.loads(clean_json_string(text))
  except json.JSONDecodeError:
    raise HTTPException(status_code=500, detail='Failed to parse AI response')

  summary = data.get('summary') if isinstance(data, dict) else ''
  risks = data.get('risks', []) if isinstance(data, dict) else []
  suggestions = data.get('suggestions', []) if isinstance(data, dict) else []

  if isinstance(risks, str):
    risks = [risks]
  if isinstance(suggestions, str):
    suggestions = [suggestions]

  return {
    'summary': summary or 'No summary available.',
    'risks': risks if isinstance(risks, list) else [],
    'suggestions': suggestions if isinstance(suggestions, list) else [],
    'lastUpdated': datetime.utcnow().isoformat(),
  }


@router.post('/parse')
def parse(payload: ParsePayload):
  model = ensure_model()
  today = datetime.now().strftime('%Y-%m-%d')
  prompt = (
    'Classify user input as LOG, EXPENSE, or MEMO (reminder/todo) for a pet app. Extract details.\n'
    'LOG tracks pet behavior (type/value/notes/date). EXPENSE tracks spending (category/amount/notes/date).\n'
    'MEMO is a reminder with title, optional notes, and dueDate (ISO 8601 date). Keep intent uppercase.\n'
    f"IMPORTANT: Today's date is {today}. Calculate relative dates (e.g., '2 days later', '明天', '后天') based on this.\n"
    f"Input: \"{payload.input}\"\n\n"
    'Return JSON with intent and the matching *_Details object. Example: '
    '{"intent": "MEMO", "memoDetails": {"title": "buy cat food", "dueDate": "2025-12-01", "notes": ""}}'
  )
  response = model.generate_content(
    prompt,
    generation_config=genai.GenerationConfig(response_mime_type='application/json'),
  )
  text = response.text
  if not text:
    return {'intent': 'UNKNOWN'}
  try:
    raw = json.loads(clean_json_string(text))
  except json.JSONDecodeError:
    return {'intent': 'UNKNOWN'}

  intent = (raw.get('intent') or 'UNKNOWN').upper()
  raw['intent'] = intent

  def _parse_iso_date(value: str | None) -> datetime | None:
    if not value:
      return None
    if isinstance(value, str):
      normalized = value.replace('Z', '+00:00')
      for candidate in (normalized, normalized.split('T')[0]):
        try:
          return datetime.fromisoformat(candidate)
        except ValueError:
          continue
    return None

  def _infer_due_date(text: str) -> datetime | None:
    # Local time to avoid UTC date shifts
    now = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    tomorrow_keywords = ['\u660e\u5929', 'tomorrow']
    for kw in tomorrow_keywords:
      if kw in text:
        return now + timedelta(days=1)
    if '\u540e\u5929' in text:
      return now + timedelta(days=2)

    day_match = re.search(r'in\s+(\d+)\s+day', text, flags=re.IGNORECASE)
    if day_match:
      return now + timedelta(days=int(day_match.group(1)))

    zh_match = re.search(r'(\d+)\s*\u5929\u540e', text)
    if zh_match:
      return now + timedelta(days=int(zh_match.group(1)))
    if '\u4e0b\u5468' in text or 'next week' in text.lower():
      return now + timedelta(days=7)
    return None

  if intent == 'LOG':
    details = raw.get('logDetails') or {}
    text_lower = payload.input.lower()
    if not details.get('type'):
      keyword_map = {
        'sleep': 'Sleep',
        'nap': 'Sleep',
        '\u7761': 'Sleep',
        '\u56f0': 'Sleep',
        'feed': 'Feeding',
        '\u5582': 'Feeding',
        '\u5403': 'Feeding',
        '\u732b\u7cae': 'Feeding',
        '\u72d7\u7cae': 'Feeding',
        'drink': 'Drinking',
        '\u559d': 'Drinking',
        'water': 'Drinking',
        'walk': 'Activity',
        'run': 'Activity',
        '\u73a9': 'Activity',
        '\u8fd0\u52a8': 'Activity',
        '\u6563\u6b65': 'Activity',
        'toilet': 'Bathroom',
        'bathroom': 'Bathroom',
        '\u5c3f': 'Bathroom',
        '\u4fbf': 'Bathroom',
        '\u6392\u6cc4': 'Bathroom',
        'med': 'Medical',
        '\u836f': 'Medical',
        '\u6253\u9489': 'Medical',
        '\u533b\u9662': 'Medical',
      }
      for keyword, mapped in keyword_map.items():
        if keyword in text_lower:
          details['type'] = mapped
          break
      details.setdefault('type', 'Note')
    if 'value' in details:
      details['value'] = str(details['value'])
    else:
      details['value'] = payload.input
    if 'notes' in details and details['notes'] is not None:
      details['notes'] = str(details['notes'])
    raw['logDetails'] = details
  elif intent == 'EXPENSE':
    expense = raw.get('expenseDetails') or {}
    if 'amount' in expense and expense['amount'] is not None:
      try:
        expense['amount'] = float(expense['amount'])
      except (TypeError, ValueError):
        expense['amount'] = 0.0
    expense.setdefault('category', 'Other')
    raw['expenseDetails'] = expense
  elif intent == 'MEMO' or (intent == 'UNKNOWN' and _infer_due_date(payload.input)):
    memo = raw.get('memoDetails') or {}
    due_raw = memo.get('dueDate') if isinstance(memo, dict) else None
    parsed_due = _parse_iso_date(due_raw) if isinstance(due_raw, str) else None
    parsed_due = parsed_due or _infer_due_date(payload.input)

    memo_details = {
      'title': str(memo.get('title') or payload.input).strip(),
      'notes': str(memo.get('notes') or memo.get('description') or '').strip() or payload.input.strip(),
      'dueDate': parsed_due.isoformat() if parsed_due else None,
      'source': 'ai',
    }
    raw['intent'] = 'MEMO'
    raw['memoDetails'] = memo_details
  return raw


@router.post('/chat')
def chat(payload: ChatPayload):
  model = ensure_model()
  recent_logs = payload.logs[:15]
  lang_instruction = (
    'CRITICAL: Reply in Simplified Chinese ONLY.'
    if payload.language == 'zh'
    else 'Reply in English.'
  )
  lines = [
    '你是一款专业的宠物管理应用内置的 AI 宠物助手。',
    '你的核心任务是基于下方的宠物资料和用户问题，给出简洁的摘要和安全、可行的行动建议。',
    '在任何情况下，都要把宠物安全放在第一位。',
    '',
    f"Pet Profile: Name: {payload.pet.get('name')}, "
    f"Species: {payload.pet.get('species')}, "
    f"Age: {payload.pet.get('age')}, "
    f"Weight: {payload.pet.get('weight')}kg.",
    '',
    'Recent History:',
  ]
  for log in recent_logs:
    date = str(log.get('date', ''))[:10]
    lines.append(f"- {date}: {log.get('type')} ({log.get('value','')}) {log.get('notes','')}")
  lines.append('')
  lines.append(f"Latest Analysis Summary: {payload.analysisSummary or 'No analysis available.'}")
  if payload.analysisRisks:
    lines.append(f"Risks identified: {', '.join(payload.analysisRisks)}")
  lines.append('')
  lines.append(lang_instruction)
  context = '\n'.join(lines)

  history = [{'role': item.role, 'parts': [{'text': item.text}]} for item in payload.history]
  messages = [
    {'role': 'user', 'parts': [{'text': context}]},
    *history,
    {'role': 'user', 'parts': [{'text': payload.newMessage}]}
  ]
  result = model.generate_content(messages)
  return {'text': result.text or ''}
