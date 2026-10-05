"""Yasal metinleri (KVKK + Kullanım Koşulları, TR/EN) tek kaynaktan üretir.

content.py düzenlendikten sonra depo kökünden çalıştırılır:
    venv/Scripts/python.exe tools/legal_texts/generate.py
Web (Next.js) ve mobil (React Native) sayfalarındaki TrContent/EnContent
fonksiyonlarını yeniden yazar; dört kopya elle düzenlenince ayrışıyordu.
Metin maddi olarak değişirse backend user_service.CONSENT_VERSION artırılır.
"""

import importlib.util
import pathlib
import re

_spec = importlib.util.spec_from_file_location("legal_content", pathlib.Path(__file__).with_name("content.py"))
assert _spec is not None and _spec.loader is not None
content = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(content)

ROOT = pathlib.Path(__file__).resolve().parents[2]
INLINE = re.compile(r"\*\*(.+?)\*\*|\[\[email\]\]|\[\[kvkk\|(.+?)\]\]|\n")


def _esc(text: str) -> str:
    return (
        text.replace("&", "&amp;")
        .replace("'", "&apos;")
        .replace('"', "&quot;")
        .replace(">", "&gt;")
        .replace("<", "&lt;")
        .replace("{", "&#123;")
        .replace("}", "&#125;")
    )


def _inline(text: str, web: bool) -> str:
    out, pos = [], 0
    for m in INLINE.finditer(text):
        out.append(_esc(text[pos : m.start()]))
        token = m.group(0)
        if m.group(1) is not None:
            bold = _esc(m.group(1))
            out.append(f"<strong>{bold}</strong>" if web else f"<Text style={{s.bold}}>{bold}</Text>")
        elif token == "[[email]]":
            out.append(
                '<a href={`mailto:${CONTACT_EMAIL}`} className="text-accent hover:underline">{CONTACT_EMAIL}</a>'
                if web
                else "<Text style={s.linkLike}>{CONTACT_EMAIL}</Text>"
            )
        elif m.group(2) is not None:
            label = _esc(m.group(2))
            out.append(
                f'<Link href="/kvkk" className="text-accent hover:underline">{label}</Link>'
                if web
                else f"<Text style={{s.linkLike}}>{label}</Text>"
            )
        else:
            out.append("<br />" if web else '{"\\n"}')
        pos = m.end()
    out.append(_esc(text[pos:]))
    return "".join(out)


def _attr(text: str) -> str:
    return "{" + '"' + text.replace("\\", "\\\\").replace('"', '\\"') + '"' + "}"


def web_body(items, with_ids: bool, highlight: bool) -> str:
    lines = []
    for item in items:
        kind = item[0]
        if kind == "h2":
            _, sid, title = item
            attr = f' id="{sid}"' if with_ids else ""
            lines.append(f"      <SectionTitle{attr}>{_esc(title)}</SectionTitle>")
        elif kind == "h3":
            lines.append(f"      <SubTitle>{_esc(item[1])}</SubTitle>")
        elif kind == "p":
            lines.append(f"      <P>{_inline(item[1], True)}</P>")
        elif kind == "hl":
            assert highlight
            lines.append(f"      <Highlight>{_inline(item[1], True)}</Highlight>")
    return "\n".join(lines)


def mobile_kvkk_body(items) -> str:
    lines, open_section = [], False
    for item in items:
        kind = item[0]
        if kind == "h2":
            if open_section:
                lines.append("      </Section>")
            _, sid, title = item
            lines.append(f'      <Section id="{sid}" title={_attr(title)} onSectionRef={{onSectionRef}} s={{s}}>')
            open_section = True
        elif kind == "h3":
            lines.append(f"        <Sub s={{s}}>{_esc(item[1])}</Sub>")
        elif kind == "p":
            lines.append(f"        <P s={{s}}>{_inline(item[1], False)}</P>")
    if open_section:
        lines.append("      </Section>")
    return "\n".join(lines)


def mobile_terms_body(items) -> str:
    lines = []
    for item in items:
        kind = item[0]
        if kind == "h2":
            lines.append(f"      <SectionTitle s={{s}}>{_esc(item[2])}</SectionTitle>")
        elif kind == "p":
            lines.append(f"      <P s={{s}}>{_inline(item[1], False)}</P>")
        elif kind == "hl":
            lines.append(f"      <Highlight s={{s}}>{_inline(item[1], False)}</Highlight>")
    return "\n".join(lines)


def _replace_region(path: pathlib.Path, start_marker: str, end_marker: str, new_region: str) -> None:
    raw = path.read_bytes().decode("utf-8")
    crlf = "\r\n" in raw
    text = raw.replace("\r\n", "\n")
    start = text.index(start_marker)
    end = text.index(end_marker, start)
    text = text[:start] + new_region + text[end:]
    path.write_bytes((text.replace("\n", "\r\n") if crlf else text).encode("utf-8"))


def _fn(signature: str, body: str) -> str:
    return f"{signature} {{\n  return (\n    <>\n{body}\n    </>\n  );\n}}\n\n"


GENERATED_NOTE = "// Aşağıdaki TrContent/EnContent tools/legal_texts/generate.py ile üretilir - elle düzenleme.\n"


def main() -> None:
    web_kvkk = ROOT / "web/src/app/kvkk/page.tsx"
    _replace_region(
        web_kvkk,
        "function TrContent()",
        "export default function KvkkPage",
        _fn("function TrContent()", web_body(content.KVKK_TR, True, False))
        + _fn("function EnContent()", web_body(content.KVKK_EN, True, False)),
    )
    web_terms = ROOT / "web/src/app/terms/page.tsx"
    _replace_region(
        web_terms,
        "function TrContent()",
        "export default function TermsPage",
        _fn("function TrContent()", web_body(content.TERMS_TR, True, True))
        + _fn("function EnContent()", web_body(content.TERMS_EN, True, True)),
    )
    mobile_sig = "({ s, onSectionRef }: { s: Styles; onSectionRef: (id: string, node: View | null) => void })"
    _replace_region(
        ROOT / "mobile/app/kvkk.tsx",
        "function TrContent(",
        "function makeStyles(",
        _fn(f"function TrContent{mobile_sig}", mobile_kvkk_body(content.KVKK_TR))
        + _fn(f"function EnContent{mobile_sig}", mobile_kvkk_body(content.KVKK_EN)),
    )
    _replace_region(
        ROOT / "mobile/app/terms.tsx",
        "function TrContent(",
        "function makeStyles(",
        _fn("function TrContent({ s }: { s: Styles })", mobile_terms_body(content.TERMS_TR))
        + _fn("function EnContent({ s }: { s: Styles })", mobile_terms_body(content.TERMS_EN)),
    )
    print("ok: web/kvkk, web/terms, mobile/kvkk, mobile/terms")


if __name__ == "__main__":
    main()
