import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";

// 2026-08-26 güvenlik denetimi: react-markdown'ın kendisi ham HTML render
// etmiyor (rehype-raw yok) ama üretilen `<a href>` değerini olduğu gibi
// DOM'a yazıyordu - LLM çıktısı (koç cevabı) `javascript:`/`data:` gibi bir
// şema üretirse (backend bunu şu an filtrelemiyor) teorik bir XSS vektörü.
// Sadece http(s)/mailto/göreli linklere izin veriliyor.
const _SAFE_HREF_SCHEMES = /^(https?:|mailto:)/i;
export function isSafeMarkdownHref(href: string | undefined): boolean {
  if (!href) return false;
  // Şema içermeyen (göreli) linkler güvenli - "javascript:..." gibi bir
  // şema, ":" öncesinde harf/rakam/+/-/. dışında karakter olamayacağından
  // regex'e YAKALANMAZ, bu yüzden ayrıca ":" var mı diye bakılıyor.
  if (!href.includes(":")) return true;
  return _SAFE_HREF_SCHEMES.test(href);
}

// Koç (LLM) cevapları markdown üretiyor (**kalın**, numaralı listeler vb.)
// ama eskiden {message.content} düz string olarak basılıyordu - kullanıcı
// ekranda yıldızları görüyordu (2026-08-14, kullanıcı canlı sohbette
// yakaladı). remarkBreaks tek satır sonlarını da <br> yapıyor ki eski
// whitespace-pre-wrap görünümüyle tutarlı kalsın.
export function MessageContent({ content, isUser }: { content: string; isUser: boolean }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkBreaks]}
      components={{
        p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
        em: ({ children }) => <em className="italic">{children}</em>,
        ul: ({ children }) => <ul className="mb-2 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>,
        ol: ({ children }) => <ol className="mb-2 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>,
        li: ({ children }) => <li>{children}</li>,
        // Uzun/detaylı cevaplarda koç "### Başlık" gibi markdown başlıkları
        // üretebiliyor (bkz. backend MAX_REPLY_SENTENCES_DETAILED, 2026-08-14)
        // - başlıksız bırakılırsa react-markdown varsayılan <h1>-<h6> boyutunu
        // kullanır, bu da balon içinde orantısız büyük durur. Rengi BİLEREK
        // belirtmiyoruz (currentColor/inherit) - bubble zaten user/assistant
        // rengini üstte ayarlıyor, burada sabitlersek karanlık modda/user
        // balonunda (beyaz metin) tutarsız kalır.
        h1: ({ children }) => <p className="mb-1.5 mt-2 first:mt-0 text-base font-bold">{children}</p>,
        h2: ({ children }) => <p className="mb-1.5 mt-2 first:mt-0 text-base font-bold">{children}</p>,
        h3: ({ children }) => <p className="mb-1 mt-2 first:mt-0 font-semibold">{children}</p>,
        h4: ({ children }) => <p className="mb-1 mt-2 first:mt-0 font-semibold">{children}</p>,
        h5: ({ children }) => <p className="mb-1 mt-2 first:mt-0 font-semibold">{children}</p>,
        h6: ({ children }) => <p className="mb-1 mt-2 first:mt-0 font-semibold">{children}</p>,
        hr: () => <hr className="my-2 border-current opacity-20" />,
        // LLM detaylı cevaplarda (bkz. MAX_REPLY_SENTENCES_DETAILED) bazen
        // markdown TABLOSU da üretebiliyor (ör. makro besin karşılaştırması,
        // canlı testte görüldü 2026-08-14) - stilsiz bırakılırsa tarayıcı
        // varsayılan tablosu balonun dışına taşabilir; overflow-x-auto
        // wrapper + border-current (tema rengine bağlı, sabit siyah değil)
        // ile hem taşmayı hem karanlık modda görünmezliği önlüyoruz.
        table: ({ children }) => (
          <div className="mb-2 overflow-x-auto">
            <table className="w-full border-collapse text-xs">{children}</table>
          </div>
        ),
        th: ({ children }) => (
          <th className="border border-current/20 px-2 py-1 text-left font-semibold">{children}</th>
        ),
        td: ({ children }) => <td className="border border-current/20 px-2 py-1">{children}</td>,
        a: ({ children, href }) => {
          if (!isSafeMarkdownHref(href)) {
            // Güvensiz şema (ör. "javascript:") - linki devre dışı bırak,
            // metni yine de göster (içerik kaybolmasın).
            return <span>{children}</span>;
          }
          return (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className={isUser ? "underline underline-offset-2" : "text-[var(--tone-accent)] underline underline-offset-2"}
            >
              {children}
            </a>
          );
        },
        code: ({ children }) => (
          <code
            className={`rounded px-1 py-0.5 text-xs ${
              isUser ? "bg-white/20" : "bg-black/10 dark:bg-white/10"
            }`}
          >
            {children}
          </code>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
