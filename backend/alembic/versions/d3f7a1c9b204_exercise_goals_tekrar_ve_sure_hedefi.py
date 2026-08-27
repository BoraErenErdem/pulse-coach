"""exercise_goals: opsiyonel tekrar hedefi + sure (kardiyo) hedefi

Revision ID: d3f7a1c9b204
Revises: c548aeceb05f
Create Date: 2026-08-27 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'd3f7a1c9b204'
down_revision: Union[str, Sequence[str], None] = 'c548aeceb05f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema.

    SQLite ham ALTER TABLE ile nullable degisikligini desteklemiyor - batch
    mode (bkz. 9232ba225e46 aynı ders) burada da gerekli."""
    with op.batch_alter_table('exercise_goals') as batch_op:
        batch_op.add_column(sa.Column('target_reps', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('target_duration_minutes', sa.Float(), nullable=True))
        batch_op.alter_column('target_weight_kg', existing_type=sa.Float(), nullable=True)


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('exercise_goals') as batch_op:
        batch_op.alter_column('target_weight_kg', existing_type=sa.Float(), nullable=False)
        batch_op.drop_column('target_duration_minutes')
        batch_op.drop_column('target_reps')
