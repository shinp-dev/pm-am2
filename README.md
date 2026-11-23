# PM A2 演習室

プロジェクトマネージャ試験の過去問175問と独自解説。Cloudflare Workers が演習画面を配信し、D1 が回答履歴・ブックマーク・メモ・5問チャレンジの自己ベストを保管します。

## デプロイ

GitHub Actions のリポジトリシークレットに以下を設定します。

| 名前 | 内容 |
| --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` | 対象の Cloudflare アカウント ID |
| `CLOUDFLARE_API_TOKEN` | 対象アカウントの Workers スクリプトと D1 の編集権限 |
| `STUDY_PASSWORD` | 演習室にログインするためのパスワード（空欄不可） |

Cloudflare アカウントで `workers.dev` サブドメインを有効にします。main への push または Actions の手動実行で、`pm-a2-study` データベースの作成・マイグレーション・デプロイを行います。URL は成功した Actions の Summary に表示されます。

## 学習履歴を引き継ぐ

旧サイトの「学習レポート」からバックアップを書き出し、新サイトで「バックアップを読み込む」を選びます。同じ回答を重複登録せず、既存のメモを優先します。画面上部で D1 の同期状況を確認できます。オフライン時の回答はブラウザに一時保存され、画面を開いている間に接続が回復すると再送されます。

出典は各問題と画面下部を参照してください。

## 問題データの更新

`node scripts/fetch-sources.mjs` で IPA の原本PDFを取得し、SHA-256 を照合します。Actions のデプロイでも同じ原本を取り込みます。
問題・解説は `first.json`、`later.json`、`year2019.json`〜`year2024.json` で編集します。PyMuPDF を入れた環境で `python build-data.py` を実行すると、全問の正答を原本と照合して `dist/data.js` を生成します。
