"""push bildirimleri ve koc tonu

Revision ID: 0930bd5b720e
Revises: 6c47945d24ec
Create Date: 2026-08-12 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '0930bd5b720e'
down_revision: Union[str, Sequence[str], None] = '6c47945d24ec'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Üç kolon TEK migration'da - hepsi aynı özelliğin (push bildirimleri) parçası,
# ayrı ayrı geri alınacak bir senaryo yok (9232ba225e46 emsaliyle tutarlı:
# birden fazla ilgili kolon tek migration'da). expo_push_token/coach_tone/kind
# HİÇBİRİ nullable=False DEĞİL (kind hariç) - server_default sadece kind için
# gerekli (mevcut satırların hepsi zaten haftalık özet).


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table('users') as batch_op:
        batch_op.add_column(
            sa.Column('expo_push_token', sa.String(), nullable=True)
        )
    with op.batch_alter_table('user_profiles') as batch_op:
        batch_op.add_column(
            sa.Column('coach_tone', sa.String(), nullable=True)
        )
    with op.batch_alter_table('checkin_messages') as batch_op:
        batch_op.add_column(
            sa.Column('kind', sa.String(), nullable=False, server_default='weekly_summary')
        )


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('checkin_messages') as batch_op:
        batch_op.drop_column('kind')
    with op.batch_alter_table('user_profiles') as batch_op:
        batch_op.drop_column('coach_tone')
    with op.batch_alter_table('users') as batch_op:
        batch_op.drop_column('expo_push_token')
