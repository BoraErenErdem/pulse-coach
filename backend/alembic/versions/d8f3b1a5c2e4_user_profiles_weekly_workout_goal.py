"""user_profiles haftalik antrenman hedefi

Revision ID: d8f3b1a5c2e4
Revises: c7e2a9d4f1b3
Create Date: 2026-09-23 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'd8f3b1a5c2e4'
down_revision: Union[str, Sequence[str], None] = 'c7e2a9d4f1b3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Haftada kaç GÜN antrenman hedeflendiği (1-7, bkz. app/services/
# weekly_goal_service.py). NULLABLE - NULL = hedef belirlenmemiş.


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table('user_profiles') as batch_op:
        batch_op.add_column(sa.Column('weekly_workout_goal_days', sa.Integer(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('user_profiles') as batch_op:
        batch_op.drop_column('weekly_workout_goal_days')
