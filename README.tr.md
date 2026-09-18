# 🌐 ZenBridge (Türkçe Dokümantasyon)

<p align="center">
  <b>OpenCode üzerindeki ücretsiz AI modellerini evrensel OpenAI uyumlu bir API gateway'ine dönüştürün.</b><br>
  <i>Tüm OpenAI uyumlu araçları, editörleri ve SDK'ları ücretsiz modellerle sorunsuzca bağlayın.</i>
</p>

<p align="center">
  <a href="README.md">🇬🇧 <b>Switch to English Documentation</b></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-20%2B-green.svg" alt="Node.js 20+">
  <img src="https://img.shields.io/badge/TypeScript-Native-blue.svg" alt="TypeScript Native">
  <img src="https://img.shields.io/badge/Dependencies-Zero-brightgreen.svg" alt="Zero Dependencies">
  <img src="https://img.shields.io/badge/OpenAI_API-Compatible-orange.svg" alt="OpenAI Compatible">
  <img src="https://img.shields.io/badge/Cost-100%25_Free-purple.svg" alt="100% Free">
</p>

---

## 🎯 Bu Proje Neden Var?

Terminalinizde `opencode serve --port 4096` komutunu çalıştırdığınızda, OpenCode zaten yerel bir HTTP REST API servisi başlatır ve ücretsiz AI modelleri (`cost: 0`) sunar. Ancak OpenCode'un bu yerel API'si, evrensel OpenAI `/v1/chat/completions` standardı yerine kendi oturum tabanlı özel bir REST mimarisi (`POST /session` &rarr; `POST /session/{id}/message`) kullanır.

Dünyadaki popüler yapay zeka araçları, IDE eklentileri ve kütüphaneleri (**Cursor, Continue.dev, LibreChat, Open WebUI, LangChain, LiteLLM, Aider, Cline vb.**) ise yalnızca **OpenAI Chat Completions protokolünü** anlar.

**ZenBridge**, bu iki sistem arasındaki hafif, hızlı ve sıfır bağımlılıklı adaptör köprüsüdür:
1. Bilgisayarınızda yerel bir standart **OpenAI Uç Noktası (`http://127.0.0.1:8080/v1`)** açar.
2. Harici araçlardan gelen standart OpenAI isteklerini anlık olarak OpenCode'un yerel oturum/mesaj formatına dönüştürür ve canlı metin akışını (streaming) iletir.
3. Böylece piyasadaki tüm yapay zeka araçlarını tek kuruş ödemeden OpenCode modelleriyle çalıştırabilirsiniz.

---

## ✨ Temel Özellikler

- 🚀 **Sıfır Harici Bağımlılık (Zero-Dependency):** Ekstra `npm install` paket yüklemesi gerektirmez, Node 20+ yerel modülleriyle anında çalışır.
- 🔄 **Dinamik Model Senkronizasyonu:** OpenCode'a yeni modeller eklendiğinde veya güncellendiğinde (`GET /config/providers`), ZenBridge modelleri canlı algılar; yeniden başlatma veya kod değişikliği gerektirmez.
- ⚡ **Canlı Akış (Streaming SSE):** ChatGPT gibi kelime kelime ekrana basılan canlı metin akışını (`stream: true`) tam destekler.
- 🧠 **Akıllı Akıl Yürütme & Düşünce Filtresi:** Modellerin iç düşünce ve sistem direktiflerini (`<think>`, `"User wants..."`, `"Keep it concise."`) otomatik temizleyerek tertemiz yanıtlar sunar.
- 🔌 **Evrensel Entegrasyon:** Python, Node.js, cURL, VS Code eklentileri ve Web UI'lar ile tam uyum.

---

## 📋 Dinamik Ücretsiz Modeller

ZenBridge, tüm aktif modelleri çalışan OpenCode sunucunuzdan dinamik olarak çeker.

* **Aktif Modelleri Listeleme:** Sunucunuzdaki anlık kullanılabilir modelleri görmek için:
  ```bash
  curl http://127.0.0.1:8080/v1/models
  ```
* **Otomatik / Yük Dengeli:** Model alanına `"auto"` yazdığınızda (veya boş bıraktığınızda), istekleriniz aktif modeller arasında otomatik olarak dağıtılır.
* **Özel Model Belirtme:** `/v1/models` çıktısında gördüğünüz herhangi bir model ID'sini doğrudan kullanabilirsiniz.

---

## 🚀 Hızlı Başlangıç (3 Adımda Kurulum)

### 1. Adım: OpenCode CLI'ı Kurun (Henüz Kurulu Değilse)
Eğer sisteminizde OpenCode CLI kurulu değilse terminalden tek komutla kurabilirsiniz:
```bash
curl -fsSL https://opencode.ai/install | bash
```

---

### 2. Adım: OpenCode Yerel Sunucusunu Başlatın
Ayrı bir terminal penceresinde OpenCode sunucusunu açın:
```bash
opencode serve --port 4096
```
*(Bu terminal penceresi arka planda açık kalmalıdır.)*

---

### 3. Adım: ZenBridge'i Çalıştırın
Yeni bir terminalde proje dizinine gelin ve başlatın:
```bash
npm start
```
veya doğrudan CLI üzerinden:
```bash
node --experimental-strip-types bin/opencode-proxy.ts --port 8080
```

Tebrikler! 🎉 Artık `http://127.0.0.1:8080/v1` adresinde çalışan yerel bir OpenAI API sunucunuz var!

---

## 💻 Örnek İstekler (cURL)

#### Normal İstek:
```bash
curl -X POST http://127.0.0.1:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "auto",
    "messages": [
      { "role": "user", "content": "Selam, nasılsın?" }
    ]
  }'
```

#### Mevcut Oturumdan Devam Etme (session_id ile):
```bash
curl -X POST http://127.0.0.1:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "auto",
    "session_id": "ses_abc123",
    "messages": [
      { "role": "user", "content": "Kaldığımız yerden devam edelim." }
    ]
  }'
```

#### Canlı Akış (Streaming):
```bash
curl -N -X POST http://127.0.0.1:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "auto",
    "messages": [
      { "role": "user", "content": "Bana hızlı bir fıkra anlat." }
    ],
    "stream": true
  }'
```

#### Akıl Yürütme (Reasoning / Efor Seviyesi) ile İstek:
```bash
curl -X POST http://127.0.0.1:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "auto",
    "include_reasoning": true,
    "reasoning_effort": "high",
    "messages": [
      { "role": "user", "content": "Bir sayının asal olup olmadığını kontrol eden algoritmayı açıkla." }
    ]
  }'
```

#### Aktif Modelleri Listeleme:
```bash
curl http://127.0.0.1:8080/v1/models
```

#### Geçmiş Oturumları Listeleme & Yönetme:
```bash
# Oturumları listeleme
curl http://127.0.0.1:8080/v1/sessions

# Belirli bir oturumun detayını getirme
curl http://127.0.0.1:8080/v1/sessions/ses_123abc456

# Tek bir oturumu silme
curl -X DELETE http://127.0.0.1:8080/v1/sessions/ses_123abc456

# TÜM oturumları toplu olarak silme
curl -X DELETE http://127.0.0.1:8080/v1/sessions
```

---

## 🛠️ API Parametreleri ve Kullanım Kılavuzu

`/v1/chat/completions` uç noktasına istek atarken kullanabileceğiniz tüm parametreler:

| Parametre | Veri Tipi | Zorunlu mu? | Varsayılan | Açıklama |
| :--- | :--- | :--- | :--- | :--- |
| **`model`** | `string` | Hayır | `"auto"` | Hedef model ID'si (`auto`, `random` veya `/v1/models` çıktısındaki herhangi bir model). Boş bırakılır veya `"auto"` verilirse tüm modeller arasında yük dengeli seçim yapar. |
| **`messages`** | `array` | **Evet** | - | Sohbet geçmişini temsil eden mesaj dizisi. Detaylar aşağıda açıklanmıştır. |
| **`stream`** | `boolean` | Hayır | `false` | `true` yapıldığında Server-Sent Events (SSE) ile daktilo gibi canlı kelime akışı başlatır. |
| **`session_id`** | `string` | Hayır | `""` | OpenCode oturum ID'si. Mevcut bir konuşma oturumuna devam etmek için kullanılır. *(İstenirse `x-session-id` HTTP başlığında da gönderilebilir)*. |
| **`include_reasoning`** | `boolean` | Hayır | `false` | `true` yapıldığında modelin iç düşünme / akıl yürütme (Chain-of-Thought) sürecini `reasoning_content` alanında döndürür (OpenAI / DeepSeek formatı). |
| **`agent`** | `string` | Hayır | `"build"` | OpenCode agent modu (`"build"`: tam geliştirme ve kod düzenleme modu, `"plan"`: yalnızca okuma/planlama modu). |
| **`directory`** | `string` | Hayır | `undefined` | Oturumun ve dosya bağlamının çalışacağı hedef proje dizini (örn. `/home/user/project`). *(İstenirse `x-directory` HTTP başlığında da gönderilebilir)*. |
| **`workspace`** | `string` | Hayır | `undefined` | İlgili OpenCode workspace tanımlayıcısı. |
| **`auto_approve`** | `boolean` | Hayır | `false` | `true` yapıldığında tüm OpenCode izin isteklerini (dosya yazma/okuma, terminal komutları vb.) otomatik onaylar (`allow`). *(İstenirse `x-auto-approve: true` başlığıyla da gönderilebilir)*. |
| **`permission`** | `array` | Hayır | `undefined` | Özel izin kuralları listesi (`[{"permission": "*", "pattern": "*", "action": "allow"}]`). |
| **`temperature`** | `number` | Hayır | `undefined` | Yanıtın yaratıcılık ve rastgelelik derecesi. |
| **`max_tokens`** | `integer` | Hayır | `undefined` | Üretilecek maksimum token adedi. |

---

### 🎭 Mesaj Rolleri (`role`)

`messages` dizisinde standart OpenAI rolleri tam olarak desteklenir:

* **`system`**: Sistemin / yapay zekanın kişiliğini, davranış kurallarını ve görevini belirleyen sistem yönergesidir. ZenBridge bu mesajı ayırarak OpenCode'un en üst seviye sistem promptuna dönüştürür.
  ```json
  { "role": "system", "content": "Sen kıdemli bir TypeScript mimarısın." }
  ```
* **`user`**: İnsan kullanıcının modele gönderdiği soru, talimat ve istemler.
  ```json
  { "role": "user", "content": "Node.js stream performansını nasıl artırırım?" }
  ```
* **`assistant`**: Modelin önceki turlarda verdiği yanıtlar. Oturum ID'si kullanılmadığında çok turlu konuşma geçmişi (multi-turn context) oluşturmak için kullanılır.
  ```json
  { "role": "assistant", "content": "Stream performansını artırmak için pipeline kullanmalısınız..." }
  ```

---

### 🧠 Düşünme & Akıl Yürütme Süreci (`include_reasoning`)

İstekte `"include_reasoning": true` gönderildiğinde dönen yanıtta modelin iç düşünce basamakları `reasoning_content` alanında döner:

```json
{
  "id": "chatcmpl-1726330000000",
  "object": "chat.completion",
  "model": "auto",
  "session_id": "ses_mock123",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Bir sayının asal olup olmadığını anlamak için kareköküne kadar olan sayılara bölmek yeterlidir...",
        "reasoning_content": "Kullanıcı asal sayı algoritması istiyor. 1. Adım: n <= 1 kontrolü. 2. Adım: 2 ve 3 kontrolü. 3. Adım: 6k +/- 1 optimizasyonu..."
      },
      "finish_reason": "stop"
    }
  ]
}
```

---

### 🎛️ `temperature` ve `max_tokens` Kullanımı

* **`temperature` (Yaratıcılık & Kesinlik Seviyesi):** `0.0` ile `2.0` arasında bir değer alır. Modelin cevabı üretirken ne kadar katı veya esnek olacağını belirler:
  * **Düşük Değerler (`0.0 - 0.2`):** Model en yüksek olasılıklı kelimeleri seçer, yanıtlar kesin, tutarlı ve mantıksaldır. **Kod yazma, JSON çıkarma ve matematik** için önerilir.
  * **Yüksek Değerler (`0.7 - 1.2`):** Model daha çeşitli ve sürpriz kelimeler seçer. **Hikaye, beyin fırtınası ve yaratıcı yazarlık** için önerilir.
* **`max_tokens` (Maksimum Cevap Uzunluğu):** Modelin üreteceği cevabın token tavanını belirler *(1 token ≈ 2-3 Türkçe karakter)*. Model bu sınıra ulaştığında cevap otomatik olarak sonlandırılır. Çok uzun yanıtları kısıtlamak veya kısa özetler almak için idealdir.

#### Örnek İstek (Düşük Sıcaklık & Token Sınırı):
```bash
curl -X POST http://127.0.0.1:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "auto",
    "temperature": 0.1,
    "max_tokens": 500,
    "messages": [
      { "role": "user", "content": "TypeScript ile hızlı bir debounce fonksiyonu yaz." }
    ]
  }'
```

---

## 📖 İnteraktif Swagger / OpenAPI Dokümantasyonu

ZenBridge, tüm API uç noktalarını tarayıcı üzerinden interaktif olarak test edebilmeniz için **Swagger UI** arayüzü ile birlikte gelir:

* **Swagger Dokümantasyon Arayüzü:** [http://127.0.0.1:8080/docs](http://127.0.0.1:8080/docs) veya [http://127.0.0.1:8080/swagger](http://127.0.0.1:8080/swagger)
* **OpenAPI 3.0 JSON Şeması:** [http://127.0.0.1:8080/openapi.json](http://127.0.0.1:8080/openapi.json)

Tarayıcınızdan `/docs` sayfasını açarak **"Try it out"** butonu ile modelleri listeleyebilir, sohbet istekleri atabilir ve oturumları yönetebilirsiniz.

---

## ⚙️ Yapılandırma Seçenekleri (CLI & .env)

`.env` dosyasını düzenleyerek veya başlatma esnasında parametre vererek yapılandırabilirsiniz:

| Parametre | Ortam Değişkeni (.env) | Varsayılan | Açıklama |
| :--- | :--- | :--- | :--- |
| `-p, --port` | `PORT` | `8080` | Proxy sunucusunun dinleyeceği port |
| `-h, --host` | `HOST` | `127.0.0.1` | Bağlanılacak IP adresi |
| `-u, --opencode-url` | `OPENCODE_BASE_URL` | `http://127.0.0.1:4096` | Arka plandaki OpenCode adresi |
| `-k, --api-key` | `API_KEY` | `""` *(Kapalı)* | İsteğe bağlı API anahtarı koruması |
| `--disable-public-ui` | `DISABLE_PUBLIC_UI` | `false` | İnternete açarken Swagger UI ve Web Dashboard'u devre dışı bırakır |
| - | `DEFAULT_MODEL` | `auto` | Model belirtilmediğinde aktif ücretsiz modeller arasında rastgele/yük dengeli seçim yapar |
| `-l, --list-models` | - | - | Aktif modelleri canlı listeler ve çıkar |

---

## 🧪 Testleri Çalıştırma

Projede yer alan TypeScript birim ve entegrasyon testlerini çalıştırmak için:

```bash
npm test
```

---

## ❓ Sıkça Sorulan Sorular (SSS)

**1. "Cannot connect to OpenCode server" hatası alıyorum, neden?**  
OpenCode yerel sunucunuz çalışmıyor olabilir. Ayrı bir terminalde `opencode serve --port 4096` komutunu çalıştırdığınızdan emin olun.

**2. OpenCode yeni bir model eklerse ne yapmalıyım?**  
Hiçbir şey yapmanıza gerek yok! ZenBridge dinamik model keşif mekanizması sayesinde OpenCode üzerindeki yeni modelleri anında algılar ve kullanımınıza sunar.

**3. API Key girmem gerekiyor mu?**  
Varsayılan olarak gerekmez. İstemcilerinizde API Key alanına herhangi bir metin (`opencode`, `dummy` vb.) yazabilirsiniz.

---

## 📄 Lisans ve Sorumluluk
MIT License. Bu proje tamamen hobi ve kişisel geliştirme amaçlı açık kaynaklı bir araçtır; OpenCode servislerine zarar verme amacı taşımaz. Kullanımdan doğabilecek sorumluluk son kullanıcıya aittir.

---

## 👨‍💻 Geliştirici
* **Osman Yavuz**
* **GitHub:** [@OsmanYavuz-web](https://github.com/OsmanYavuz-web)
* **E-Posta:** [omnyvz.yazilim@gmail.com](mailto:omnyvz.yazilim@gmail.com)


