#!/usr/bin/env bash
set -euo pipefail

# EchoNote GCPセットアップスクリプト
# gcloud + gws を使ってサービスアカウントとDrive共有を自動設定

PROJECT_ID="echonote-$(date +%s | tail -c 7)"
SA_NAME="echonote-sa"
SA_KEY_FILE="sa-key.json"
ENV_FILE=".env.local"

echo "==============================="
echo " EchoNote GCPセットアップ"
echo "==============================="
echo ""

# 1. 現在のgcloudアカウントを保存（終了後に戻す用）
ORIGINAL_ACCOUNT=$(gcloud config get account 2>/dev/null || echo "")
echo "[INFO] 現在のgcloudアカウント: $ORIGINAL_ACCOUNT"
echo ""

# 2. プライベートアカウントでログイン
echo "[STEP 1/8] プライベートGoogleアカウントでログインしてください..."
gcloud auth login --no-launch-browser
PRIVATE_ACCOUNT=$(gcloud config get account 2>/dev/null)
echo "[OK] ログイン完了: $PRIVATE_ACCOUNT"
echo ""

# 3. プロジェクト作成
echo "[STEP 2/8] GCPプロジェクト作成: $PROJECT_ID"
gcloud projects create "$PROJECT_ID" --name="EchoNote" 2>/dev/null || {
  echo "[WARN] プロジェクト作成失敗。既存プロジェクトを使用しますか？"
  read -rp "プロジェクトID を入力: " PROJECT_ID
}
gcloud config set project "$PROJECT_ID"
echo "[OK] プロジェクト設定完了: $PROJECT_ID"
echo ""

# 4. Drive API有効化
echo "[STEP 3/8] Google Drive API を有効化..."
gcloud services enable drive.googleapis.com
echo "[OK] Drive API 有効化完了"
echo ""

# 5. サービスアカウント作成
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
echo "[STEP 4/8] サービスアカウント作成: $SA_EMAIL"
gcloud iam service-accounts create "$SA_NAME" \
  --display-name="EchoNote Drive Access" 2>/dev/null || {
  echo "[INFO] サービスアカウントは既に存在します"
}
echo "[OK] サービスアカウント: $SA_EMAIL"
echo ""

# 6. JSONキー作成
echo "[STEP 5/8] サービスアカウントキーをダウンロード..."
gcloud iam service-accounts keys create "$SA_KEY_FILE" \
  --iam-account="$SA_EMAIL"
echo "[OK] キーファイル: $SA_KEY_FILE"
echo ""

# 7. gws で Drive操作（EchoNoteフォルダ検索 + 共有）
echo "[STEP 6/8] gws でGoogle Driveにログイン..."
echo "(ブラウザでDriveへのアクセスを許可してください)"
gws auth login 2>/dev/null || echo "[INFO] gws 認証済み"
echo ""

echo "[STEP 7/8] EchoNoteフォルダを検索..."
FOLDER_RESULT=$(gws drive files list --params "{\"q\": \"name = 'EchoNote' and mimeType = 'application/vnd.google-apps.folder'\", \"fields\": \"files(id,name)\"}" 2>/dev/null)
FOLDER_ID=$(echo "$FOLDER_RESULT" | python3 -c "import sys,json; files=json.load(sys.stdin).get('files',[]); print(files[0]['id'] if files else '')" 2>/dev/null || echo "")

if [ -z "$FOLDER_ID" ]; then
  echo "[WARN] EchoNoteフォルダが見つかりません"
  read -rp "DriveのフォルダIDを手動で入力: " FOLDER_ID
else
  echo "[OK] EchoNoteフォルダID: $FOLDER_ID"
fi
echo ""

# フォルダをサービスアカウントに共有
echo "[STEP 8/8] サービスアカウントにフォルダを共有..."
gws drive permissions create \
  --params "{\"fileId\": \"$FOLDER_ID\"}" \
  --json "{\"role\": \"reader\", \"type\": \"user\", \"emailAddress\": \"$SA_EMAIL\"}" 2>/dev/null && \
  echo "[OK] 共有設定完了" || echo "[WARN] 共有設定に失敗。Driveから手動で $SA_EMAIL に共有してください"
echo ""

# 8. .env.local に書き込み
SA_KEY_BASE64=$(cat "$SA_KEY_FILE" | base64 -w 0 2>/dev/null || cat "$SA_KEY_FILE" | base64 2>/dev/null)

# 既存の .env.local を読み込み、該当キーを更新
touch "$ENV_FILE"
# GOOGLE_SERVICE_ACCOUNT_KEY
if grep -q "^GOOGLE_SERVICE_ACCOUNT_KEY=" "$ENV_FILE" 2>/dev/null; then
  sed -i "s|^GOOGLE_SERVICE_ACCOUNT_KEY=.*|GOOGLE_SERVICE_ACCOUNT_KEY=$SA_KEY_BASE64|" "$ENV_FILE"
else
  echo "GOOGLE_SERVICE_ACCOUNT_KEY=$SA_KEY_BASE64" >> "$ENV_FILE"
fi
# DRIVE_FOLDER_ID
if grep -q "^DRIVE_FOLDER_ID=" "$ENV_FILE" 2>/dev/null; then
  sed -i "s|^DRIVE_FOLDER_ID=.*|DRIVE_FOLDER_ID=$FOLDER_ID|" "$ENV_FILE"
else
  echo "DRIVE_FOLDER_ID=$FOLDER_ID" >> "$ENV_FILE"
fi

echo ""
echo "==============================="
echo " セットアップ完了!"
echo "==============================="
echo " プロジェクト: $PROJECT_ID"
echo " サービスアカウント: $SA_EMAIL"
echo " フォルダID: $FOLDER_ID"
echo " .env.local に書き込み済み"
echo ""

# キーファイルを削除（.env.local にbase64で保存済み）
rm -f "$SA_KEY_FILE"
echo "[CLEANUP] $SA_KEY_FILE を削除しました"

# 元のアカウントに戻す
if [ -n "$ORIGINAL_ACCOUNT" ] && [ "$ORIGINAL_ACCOUNT" != "$PRIVATE_ACCOUNT" ]; then
  echo ""
  read -rp "gcloudアカウントを $ORIGINAL_ACCOUNT に戻しますか？ [Y/n]: " RESTORE
  if [ "${RESTORE:-Y}" != "n" ]; then
    gcloud config set account "$ORIGINAL_ACCOUNT"
    echo "[OK] アカウントを $ORIGINAL_ACCOUNT に戻しました"
  fi
fi
