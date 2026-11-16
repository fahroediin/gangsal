# Deploy Gangsal (Big Five) ke VPS

Target: VPS AlmaLinux yang sama dengan ba.learning.my.id (Bun, PM2, nginx sudah ada).
Isi `<SUBDOMAIN>` dan `<PORT>` sebelum menjalankan. Port 3010 sudah dipakai `ba-handbook-api`; pakai port kosong, misalnya 3020.

## 1. Salin kode

```bash
# di VPS
sudo mkdir -p /opt/gangsal && sudo chown $USER /opt/gangsal
# dari laptop (folder WEB/tes-16-tipe)
scp -r server.ts og.ts public package.json bun.lock user@vps:/opt/gangsal/
# di VPS
cd /opt/gangsal && bun install --production
# font untuk teks di gambar pratinjau /og/<kode>.png (tanpa font, teksnya kosong)
sudo dnf install -y dejavu-sans-fonts
```

Data SQLite disimpan di `/opt/gangsal/data/gangsal.sqlite` (dibuat otomatis, tidak ikut repo).

## 2. Jalankan dengan PM2

```bash
cd /opt/gangsal
PORT=<PORT> HOST=127.0.0.1 TRUST_PROXY=1 pm2 start "bun server.ts" --name gangsal --update-env
pm2 save
curl -s http://127.0.0.1:<PORT>/api/stats
```

## 3. nginx

`/etc/nginx/conf.d/gangsal.conf`:

```nginx
server {
    listen 80;
    server_name <SUBDOMAIN>;
    location / {
        proxy_pass http://127.0.0.1:<PORT>;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        client_max_body_size 8k;
    }
}
```

```bash
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d <SUBDOMAIN>
```

DNS: tambah A record `<SUBDOMAIN>` ke IP VPS sebelum certbot.

## 4. Cek setelah deploy

- Buka `https://<SUBDOMAIN>`, kerjakan tes sampai hasil, pastikan status "Hasil masuk rekap peserta".
- Tab Rekap menampilkan jumlah peserta bertambah.
- Buka `https://<SUBDOMAIN>/og/72-55-40-80-30.png`: harus tampil gambar dengan teks nama dimensi. Kalau teksnya kosong, font belum terpasang.
- Tempel tautan `https://<SUBDOMAIN>/h/72-55-40-80-30` ke chat WhatsApp atau ke pratinjau di opengraph.xyz untuk melihat kartu pratinjau.
- Cadangan data: `sqlite3 /opt/gangsal/data/gangsal.sqlite ".backup /root/gangsal-$(date +%F).sqlite"`.
