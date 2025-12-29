const API_URL = "http://localhost:3000";

export async function fetchRooms(token: string) {
  const res = await fetch(`${API_URL}/rooms`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return res.json();
}

export async function fetchMessages(token: string, roomId: number) {
  const res = await fetch(`${API_URL}/messages/${roomId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return res.json();
}

export async function sendMessage(
  token: string,
  roomId: number,
  content: string
) {
  const res = await fetch(`${API_URL}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ roomId, content }),
  });
  return res.json();
}
