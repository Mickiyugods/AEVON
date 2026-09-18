export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const jwt = process.env.PINATA_JWT;
  if (!jwt) {
    return res.status(500).json({ error: 'IPFS service not configured' });
  }

  try {
    const { dataUrl } = req.body;
    if (!dataUrl || !dataUrl.startsWith('data:')) {
      return res.status(400).json({ error: 'Invalid image data' });
    }

    const match = dataUrl.match(/^data:(.+?);base64,(.+)$/);
    if (!match) {
      return res.status(400).json({ error: 'Invalid base64 data URL' });
    }

    const mimeType = match[1];
    const base64Data = match[2];
    const buffer = Buffer.from(base64Data, 'base64');

    const ext = mimeType.split('/')[1] === 'jpeg' ? 'jpg' : mimeType.split('/')[1] || 'png';
    const fileName = `token-logo-${Date.now()}.${ext}`;

    const form = new FormData();
    form.append('file', new Blob([buffer], { type: mimeType }), fileName);

    const pinataRes = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
      method: 'POST',
      headers: { Authorization: `Bearer ${jwt}` },
      body: form,
    });

    if (!pinataRes.ok) {
      const err = await pinataRes.text();
      console.error('Pinata error:', err);
      return res.status(502).json({ error: 'IPFS upload failed' });
    }

    const pinataData = await pinataRes.json();
    const ipfsUrl = `ipfs://${pinataData.IpfsHash}`;

    return res.status(200).json({ ipfsUrl, hash: pinataData.IpfsHash });
  } catch (e) {
    console.error('Upload error:', e);
    return res.status(500).json({ error: 'Upload failed' });
  }
}
