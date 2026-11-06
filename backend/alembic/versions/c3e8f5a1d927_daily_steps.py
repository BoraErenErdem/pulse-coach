"""daily_steps + users adım rızası (Apple Sağlık'tan eşitlenen günlük adım)

Revision ID: c3e8f5a1d927
Revises: b7d4e1a9c362
Create Date: 2026-11-06 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'c3e8f5a1d927'
down_revision: Union[str, Sequence[str], None] = 'b7d4e1a9c362'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Kullanıcı başına gün başına tek satır; kalori saklanmaz (kilo/boydan her
# okumada hesaplanır, bkz. app/services/step_service.py). Adım verisi ayrı,
# isteğe bağlı açık rızaya dayanır (KVKK metni 2.1): users.steps_consent_*.


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('daily_steps',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('step_date', sa.Date(), nullable=False),
    sa.Column('steps', sa.Integer(), nullable=False),
    sa.Column('source', sa.String(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('user_id', 'step_date', name='uq_daily_steps_user_date')
    )
    op.create_index(op.f('ix_daily_steps_id'), 'daily_steps', ['id'], unique=False)
    with op.batch_alter_table('users') as batch_op:
        batch_op.add_column(sa.Column('steps_consent_at', sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column('steps_consent_version', sa.String(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('users') as batch_op:
        batch_op.drop_column('steps_consent_version')
        batch_op.drop_column('steps_consent_at')
    op.drop_index(op.f('ix_daily_steps_id'), table_name='daily_steps')
    op.drop_table('daily_steps')
