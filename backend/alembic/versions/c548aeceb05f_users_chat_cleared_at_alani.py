"""users chat_cleared_at alani

Revision ID: c548aeceb05f
Revises: 455211f62d50
Create Date: 2026-08-17 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'c548aeceb05f'
down_revision: Union[str, Sequence[str], None] = '455211f62d50'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# "Sohbeti Sıfırla" (soft-clear, bkz. conversation_service.soft_clear) için:
# kullanıcı sıfırlayınca bu tarih set edilir, bu tarihten ÖNCEKİ mesajlar ne
# ekranda listelenir ne de koçun (orchestrator._load_history) bağlamına
# dahil edilir - ama veritabanında SİLİNMEZ (kalıcı silme ayrı bir aksiyon,
# bkz. conversation_service.hard_delete_history, bu alanı NULL'a döner çünkü
# gizlenecek bir şey kalmaz). Mevcut kullanıcılarda NULL kalır (geriye dönük
# veri kaybı/davranış değişikliği yok).


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table('users') as batch_op:
        batch_op.add_column(sa.Column('chat_cleared_at', sa.DateTime(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('users') as batch_op:
        batch_op.drop_column('chat_cleared_at')
