gcloud run services update apparel-cloud-api --region asia-south1 `
--project gen-lang-client-0222340998 `
  --update-env-vars GEMINI_API_KEY2=<nayi-value>

  gcloud run deploy apparel-cloud-api --source . --region asia-south1 --project gen-lang-client-0222340998