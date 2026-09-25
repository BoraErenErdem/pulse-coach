"""user_profiles gorunen ad ve bildirim tercihleri

Revision ID: e5a2c8d1f7b6
Revises: d8f3b1a5c2e4
Create Date: 2026-09-25 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'e5a2c8d1f7b6'
down_revision: Union[str, Sequence[str], None] = 'd8f3b1a5c2e4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Profil sekmesi turu (2026-09-25): isteğe bağlı görünen ad + koç bildirim
# tercihleri. Tercihler mevcut kullanıcılar için AÇIK başlar (server_default
# true) - davranış bu migration'dan önceki ile aynı kalır.


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table('user_profiles') as batch_op:
        batch_op.add_column(sa.Column('display_name', sa.String(), nullable=True))
        batch_op.add_column(sa.Column('daily_nudge_enabled', sa.Boolean(), nullable=False, server_default=sa.true()))
        batch_op.add_column(sa.Column('weekly_summary_enabled', sa.Boolean(), nullable=False, server_default=sa.true()))
        batch_op.add_column(sa.Column('daily_nudge_hour', sa.Integer(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('user_profiles') as batch_op:
        batch_op.drop_column('daily_nudge_hour')
        batch_op.drop_column('weekly_summary_enabled')
        batch_op.drop_column('daily_nudge_enabled')
        batch_op.drop_column('display_name')
