# ADR 0001: Google Drive クライアントは `@googleapis/drive` 単体パッケージを使う

日付: 2026-08-22 / 状態: 採択

Railway の月額は96%がメモリ課金で、EchoNote アプリは7日平均249MB常駐していた（Postgresは46MB）。原因は `googleapis` 本体の import が約200種のAPIクライアントを全て読み込むことで、Node単体で +91MB、standalone サーバーの実測で 163MB→82MB の差が出た。機能は Drive v3 のみなので公式の単体パッケージ `@googleapis/drive` に切り替える。以後 `googleapis` 本体を依存に戻さない（他のGoogle APIが必要になっても `@googleapis/<api>` を個別に入れる）。不採択: `--max-old-space-size` 等のヒープ上限操作（Botchy の Codex レビューで却下済みの手法と同種）。
