# デリくらべ 公開価格サーバー運用手順

このサーバーはNode.js 20以降で動きます。依存パッケージはありません。

## 1. 開発環境で起動

```sh
cd server
npm start
```

既定では `http://localhost:8787/api/health` が応答します。
実際のGitHub Pagesからアクセスさせる場合は、HTTPSで公開できる別サービスへ本 `server` フォルダーを配置し、次の環境変数を設定します。

- `PORT`: ホスティング側の指定ポート（指定しなければ 8787）
- `PUBLIC_APP_ORIGIN`: `https://yusuke1534.github.io` など、GitHub Pagesの**オリジン**。パスは含めません。

想定するAPIパス：`GET /api/public-prices?storeId=seed-fujinomiya-01`、`POST /api/quotes`、`GET /api/health`。

## 2. 公開価格のデータ源を登録

初期ファイル `api/public-price-sources.json` の `sources` は空配列です。店舗から自動利用について許可を得た、公式の**店舗別**メニューだけを登録します。

一件の登録例（URLは説明用、**実在の接続先ではありません**）：

```json
{
  "version": 1,
  "sources": [
    {
      "storeId": "seed-fujinomiya-01",
      "provider": "direct",
      "format": "jsonld",
      "url": "https://merchant.example/menu",
      "allowedHosts": ["merchant.example"],
      "authorized": true,
      "authorizationNote": "店舗から自動参照・掲載の許可を得た日付と用途"
    }
  ]
}
```

- `format: "jsonld"`: 許可された店舗の公開HTMLから `<script type="application/ld+json">` の schema.org `Product` / `MenuItem` の `offers.price` を読みます。
- `format: "json"`: 店舗が許可して提供するフィード。JSON形式：`{"storeId":"seed-fujinomiya-01","items":[{"name":"商品名","price":整数,"currency":"JPY"}]}`。この記載はデータ形式例であり実価格ではありません。
- `provider`: `direct` / `demae` / `uber` / `rocket` のいずれか。各配達プラットフォームへの接続は、**各社が許可した形式のフィード／提携API**に限定します。公開注文画面を無断自動取得しません。
- `url`: HTTPSのみ。`allowedHosts` に列挙したホストと完全一致するものだけサーバーから取得します。リダイレクトしません。
- `authorized: true` / `authorizationNote`: 自動取得・再掲載を認められた場合のみ設定。URLの登録前に利用規約・必要な許諾を確認してください。

`api/public-price-sources.json` を編集した後はサーバーを再起動します。

## 3. GitHub Pages側と接続

`index.html` にある `PUBLIC_PRICE_API_DEFAULT` の空文字を、サーバーのHTTPS URL（末尾 `/api/public-prices`）に変更すれば全閲覧者に反映できます。

運営者の端末で試すだけなら「店舗管理 > 公開価格取得サーバー」からURLを入力できます（端末内にのみ保存）。

ユーザーが店舗カードの「公開価格を調べる」を押すと、登録済みの情報源へ自動照会します。未設定なら価格は出ません。情報源のページをアクセスした時刻が表示され、ページ自体の価格更新時刻を表すものではありません。

### 注意

- 商品価格の比較は**支払総額の比較ではありません**。配達料や個別割引などは `POST /api/quotes` で正式な見積データが取得できて初めて比較できます。
- `api/quote-adapters.mjs` は未接続です。許諾済みの公式APIと接続するまで価格の推測や配達可否の断定をしません。
- サーバーが非公開先を取得しないように構成URLにネットワーク制限を設けています。本番運用時にはレート制限・監視・認証・DNSルックアップ制限・プラットフォームの個別利用条件なども確認してください。
- ユーザーの配達先住所は公開価格APIに送信しません。正式な見積照会用エンドポイントへは送信されますが、サーバーで保存・ログ出力しないでください。
- このアプリの店舗情報編集は認証付きの共通管理システムではありません。本格運用前に別途設計が必要です。

## 4. テスト

```sh
node tests/test-public-menu.mjs
node tests/test-ui.mjs
```

テストでは、フィード・JSON-LD・情報源なし・不正価格・古い情報・許可されていないホストを確認します。
