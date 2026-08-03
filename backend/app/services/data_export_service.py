from sqlalchemy import inspect
from sqlalchemy.orm import Session
from app.models.checkin_message import CheckinMessage
from app.models.conversation import Conversation
from app.models.exercise_goal import ExerciseGoal
from app.models.meal_entry import MealEntry
from app.models.mood_log import MoodLog
from app.models.progress_log import ProgressLog
from app.models.user import User
from app.models.user_profile import UserProfile
from app.models.workout_session import WorkoutSession


def _row_to_dict(row) -> dict:
    """Bir SQLAlchemy satırını sütun bazında düz bir dict'e çevirir - export
    için API'nin dışa dönük Read şemalarından BİLEREK bağımsız (onlar joined/
    hesaplanmış alanlar içerebiliyor, export ham veriyi olduğu gibi vermeli).
    FastAPI'nin jsonable_encoder'ı date/datetime alanları otomatik ISO 8601'e
    çeviriyor, burada elle dönüştürmeye gerek yok."""
    return {column.key: getattr(row, column.key) for column in inspect(row).mapper.column_attrs}


def export_user_data(db: Session, user_id: int) -> dict:
    """Kullanıcının sahip olduğu TÜM veriyi (hesap silmede cascade edilen
    tablolarla birebir aynı kapsam - bkz. User modelindeki relationship'ler)
    tek bir JSON-serileştirilebilir dict olarak toplar (GDPR-tarzı "verini
    indir" özelliği). refresh_tokens/password_reset_tokens BİLEREK dışarıda
    bırakıldı - bunlar kullanıcının "verisi" değil, güvenlik artefaktı
    (token hash'i), export'ta anlamlı/gerekli değil."""
    user = db.get(User, user_id)
    profile = db.query(UserProfile).filter(UserProfile.user_id == user_id).first()
    workout_sessions = db.query(WorkoutSession).filter(WorkoutSession.user_id == user_id).all()

    return {
        "user": {"id": user.id, "email": user.email, "created_at": user.created_at},
        "profile": _row_to_dict(profile) if profile else None,
        "progress_logs": [
            _row_to_dict(row) for row in db.query(ProgressLog).filter(ProgressLog.user_id == user_id).all()
        ],
        "conversations": [
            _row_to_dict(row) for row in db.query(Conversation).filter(Conversation.user_id == user_id).all()
        ],
        "checkin_messages": [
            _row_to_dict(row)
            for row in db.query(CheckinMessage).filter(CheckinMessage.user_id == user_id).all()
        ],
        "meal_entries": [
            _row_to_dict(row) for row in db.query(MealEntry).filter(MealEntry.user_id == user_id).all()
        ],
        "exercise_goals": [
            _row_to_dict(row) for row in db.query(ExerciseGoal).filter(ExerciseGoal.user_id == user_id).all()
        ],
        "mood_logs": [_row_to_dict(row) for row in db.query(MoodLog).filter(MoodLog.user_id == user_id).all()],
        "workout_sessions": [
            {**_row_to_dict(session), "sets": [_row_to_dict(row) for row in session.sets]}
            for session in workout_sessions
        ],
    }
