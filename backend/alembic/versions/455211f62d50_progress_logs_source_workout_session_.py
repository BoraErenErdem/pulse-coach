"""progress_logs source_workout_session_id alani

Revision ID: 455211f62d50
Revises: 0930bd5b720e
Create Date: 2026-08-15 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '455211f62d50'
down_revision: Union[str, Sequence[str], None] = '0930bd5b720e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# log_workout_session bir oturum kaydederken otomatik olarak basit bir
# "workout_completed" ProgressLog satırı da oluşturuyor - önceden bu satırla
# oturum arasında GERÇEK bir bağ yoktu, sadece log_date eşleşmesi vardı, bu
# yüzden bir oturum silindiğinde otomatik oluşan satır YETİM kalıyordu
# (2026-08-14 canlı test turunda bulundu). Bu migration nullable bir FK
# ekliyor - mevcut satırlarda hep NULL kalır (geriye dönük veri kaybı yok).


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table('progress_logs') as batch_op:
        batch_op.add_column(sa.Column('source_workout_session_id', sa.Integer(), nullable=True))
        batch_op.create_foreign_key(
            'fk_progress_logs_source_workout_session_id',
            'workout_sessions',
            ['source_workout_session_id'],
            ['id'],
        )


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('progress_logs') as batch_op:
        batch_op.drop_constraint('fk_progress_logs_source_workout_session_id', type_='foreignkey')
        batch_op.drop_column('source_workout_session_id')
