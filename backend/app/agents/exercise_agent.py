from langchain_core.tools import BaseTool, tool
from app.rag.retriever import retrieve


def build_exercise_tools() -> list[BaseTool]:
    @tool
    def search_exercise_knowledge(query: str) -> str:
        """Egzersiz bilgi tabanında (antrenman programı temelleri, form/teknik,
        hedefe göre egzersiz yaklaşımı, kardiyo vs kuvvet) query ile en alakalı
        parçaları getirir. Egzersiz ile ilgili her soruda cevap vermeden önce bu
        aracı çağır ve yanıtını buradan dönen bilgilere dayandır; bilgi tabanında
        olmayan konularda kesin/kişiye özel program uydurma."""
        return retrieve("exercise", query)

    return [search_exercise_knowledge]
