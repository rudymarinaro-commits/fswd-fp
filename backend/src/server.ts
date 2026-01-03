import "dotenv/config";
import server from "./services/socket";
import roomsRoutes from "./rooms/rooms.routes";
import app from "./app";

app.use("/rooms", roomsRoutes);

server.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});
