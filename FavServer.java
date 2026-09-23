import com.sun.net.httpserver.HttpServer;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.Headers;
import com.sun.net.httpserver.HttpHandler;

import java.io.*;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.Properties;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class FavServer {
    private static final File STORE = new File("favorite.properties");

    public static void main(String[] args) throws Exception {
        HttpServer server = HttpServer.create(new InetSocketAddress(8080), 0);
        server.createContext("/favorite", new FavoriteHandler());
        server.setExecutor(null);
        System.out.println("FavServer running on http://localhost:8080");
        server.start();
    }

    static class FavoriteHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            try {
                // CORS
                Headers h = exchange.getResponseHeaders();
                h.add("Access-Control-Allow-Origin", "*");
                h.add("Access-Control-Allow-Methods", "GET,POST,OPTIONS,DELETE");
                h.add("Access-Control-Allow-Headers", "Content-Type");

                String method = exchange.getRequestMethod();
                if ("OPTIONS".equalsIgnoreCase(method)) {
                    send(exchange, 204, "");
                    return;
                }

                if ("GET".equalsIgnoreCase(method)) {
                    handleGet(exchange);
                    return;
                }

                if ("POST".equalsIgnoreCase(method)) {
                    handlePost(exchange);
                    return;
                }

                if ("DELETE".equalsIgnoreCase(method)) {
                    if (STORE.exists()) STORE.delete();
                    send(exchange, 200, "{}");
                    return;
                }

                send(exchange, 405, "{}");
            } catch (Exception e) {
                e.printStackTrace();
                send(exchange, 500, "{}");
            }
        }

        private void handleGet(HttpExchange exchange) throws IOException {
            if (!STORE.exists()) {
                send(exchange, 404, "{}");
                return;
            }
            Properties p = new Properties();
            try (FileInputStream in = new FileInputStream(STORE)){
                p.load(in);
            }
            String name = p.getProperty("name", "");
            String lat = p.getProperty("lat", "");
            String lon = p.getProperty("lon", "");
            String json = String.format("{\"name\":%s,\"lat\":%s,\"lon\":%s}",
                    quoteJson(name), lat, lon);
            send(exchange, 200, json);
        }

        private void handlePost(HttpExchange exchange) throws IOException {
            String body = readAll(exchange.getRequestBody());
            // Very small JSON extractor for name/lat/lon
            String name = extractString(body, "name");
            String lat = extractNumber(body, "lat");
            String lon = extractNumber(body, "lon");

            Properties p = new Properties();
            if (name != null) p.setProperty("name", name);
            if (lat != null) p.setProperty("lat", lat);
            if (lon != null) p.setProperty("lon", lon);

            try (FileOutputStream out = new FileOutputStream(STORE)){
                p.store(out, "favorite city") ;
            }
            send(exchange, 200, "{\"ok\":true}");
        }

        private static String readAll(InputStream in) throws IOException {
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            byte[] buf = new byte[2048];
            int r;
            while ((r = in.read(buf)) != -1) baos.write(buf,0,r);
            return new String(baos.toByteArray(), StandardCharsets.UTF_8);
        }

        private static void send(HttpExchange exchange, int status, String body) throws IOException {
            byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json; charset=utf-8");
            exchange.sendResponseHeaders(status, bytes.length);
            try (OutputStream os = exchange.getResponseBody()){
                os.write(bytes);
            }
        }

        private static String extractString(String json, String key){
            if (json == null) return null;
            Pattern p = Pattern.compile("\""+Pattern.quote(key)+"\"\\s*:\\s*\"(.*?)\"", Pattern.DOTALL);
            Matcher m = p.matcher(json);
            if (m.find()) return m.group(1);
            return null;
        }

        private static String extractNumber(String json, String key){
            if (json == null) return null;
            Pattern p = Pattern.compile("\""+Pattern.quote(key)+"\"\\s*:\\s*([0-9.+-eE]+)");
            Matcher m = p.matcher(json);
            if (m.find()) return m.group(1);
            return null;
        }

        private static String quoteJson(String s){
            if (s == null) return "\"\"";
            return "\"" + s.replace("\\","\\\\").replace("\"","\\\"") + "\"";
        }
    }
}
