from app.rag.vector_store import get_vector_store


def retrieve(category: str, query: str, k: int = 4) -> str:
    """category ('nutrition'/'exercise') bilgi tabanında query'e en yakın k parçayı
    kaynak dosya adıyla birlikte formatlanmış tek bir metin olarak döner."""
    store = get_vector_store(category)
    results = store.similarity_search(query, k=k)
    if not results:
        return "Bilgi tabanında bu konuyla ilgili içerik bulunamadı."

    parts = [
        f"[Kaynak: {doc.metadata.get('source', 'bilinmiyor')}]\n{doc.page_content}"
        for doc in results
    ]
    return "\n\n---\n\n".join(parts)
