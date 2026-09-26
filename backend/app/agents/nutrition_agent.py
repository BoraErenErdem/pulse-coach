from langchain_core.tools import BaseTool, tool
from app.rag.retriever import retrieve


def build_nutrition_tools() -> list[BaseTool]:
    @tool
    def search_nutrition_knowledge(query: str) -> str:
        """Beslenme bilgi tabanında (genel beslenme ilkeleri, makro/kalori hesaplama,
        öğün fikirleri, hedefe göre beslenme yaklaşımı) query ile en alakalı parçaları
        getirir. Beslenme ile ilgili her soruda cevap vermeden önce bu aracı çağır ve
        yanıtını buradan dönen bilgilere dayandır; bilgi tabanında olmayan konularda
        kesin/kişiye özel tıbbi diyet tavsiyesi uydurma. Soru kullanıcının KENDİ
        ihtiyacıysa ("günlük ne kadar protein almalıyım", "kaç kalori yemeliyim")
        get_user_profile'ı da çağır: hesabı onun gerçek kilosuyla yap, kilo
        varsayma; kayıtlı bir günlük hedefi varsa onu da an."""
        return retrieve("nutrition", query)

    return [search_nutrition_knowledge]
