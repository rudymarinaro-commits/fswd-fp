import "dotenv/config";
import server from "./services/socket";

server.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});
