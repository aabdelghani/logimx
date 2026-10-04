#include "ipc.h"

#include <stdexcept>

#include "platform/platform.h"

namespace ipc {

std::string defaultSocketPath() { return platform::ipcEndpoint(); }

Server::Server(Handler h, std::string path) : handler_(std::move(h)), path_(std::move(path)) {
    listener_ = Listener::create(path_);
    thread_ = std::thread([this] { acceptLoop(); });
}

Server::~Server() {
    stop_ = true;
    if (thread_.joinable()) thread_.join();
    listener_.reset();
    // the serve threads are detached: close their streams and wait for them to let go of this
    std::unique_lock<std::mutex> lk(clientsMutex_);
    for (auto& c : clients_) c->close();
    served_.wait_for(lk, std::chrono::seconds(2), [this] { return serving_ == 0; });
}

void Server::acceptLoop() {
    while (!stop_) {
        auto c = listener_->accept(300);
        if (!c) continue;
        {
            std::lock_guard<std::mutex> lk(clientsMutex_);
            clients_.insert(c);
            ++serving_;
        }
        std::thread([this, c] { serve(c); }).detach();
    }
}

void Server::serve(std::shared_ptr<Conn> c) {
    std::string buf;
    char tmp[4096];
    while (!stop_) {
        int n = c->recv(tmp, sizeof(tmp));
        if (n <= 0) break;
        buf.append(tmp, static_cast<size_t>(n));
        if (buf.size() > 8 * 1024 * 1024 && buf.find('\n') == std::string::npos) break;  // oversized request, drop client
        size_t nl;
        while ((nl = buf.find('\n')) != std::string::npos) {
            std::string line = buf.substr(0, nl);
            buf.erase(0, nl + 1);
            json resp, reqId;
            try {
                json req = json::parse(line);
                if (req.is_object()) reqId = req.value("id", json());
                json params = req.is_object() ? req.value("params", json::object()) : json::object();
                if (!params.is_object()) params = json::object();
                resp = {{"id", reqId}, {"result", handler_(req.is_object() ? req.value("method", "") : "", params)}};
            } catch (const std::exception& e) {
                resp = {{"id", reqId}, {"error", e.what()}};
            }
            if (!c->send(resp.dump() + "\n")) break;
        }
    }
    std::lock_guard<std::mutex> lk(clientsMutex_);
    clients_.erase(c);
    --serving_;
    served_.notify_all();
}

void Server::broadcast(const std::string& event, const json& data) {
    std::string msg = json{{"event", event}, {"data", data}}.dump() + "\n";
    std::lock_guard<std::mutex> lk(clientsMutex_);
    for (auto& c : clients_) c->send(msg);
}

Client::Client(std::string path) : conn_(connect(path)) {}

json Client::call(const std::string& method, const json& params) {
    json req = {{"id", ++id_}, {"method", method}, {"params", params}};
    if (!conn_->send(req.dump() + "\n")) throw std::runtime_error("send failed");
    char tmp[4096];
    for (;;) {
        size_t nl = buf_.find('\n');
        if (nl != std::string::npos) {
            std::string line = buf_.substr(0, nl);
            buf_.erase(0, nl + 1);
            json resp = json::parse(line);
            if (resp.contains("event")) continue;  // ignore broadcasts on a request socket
            if (resp.contains("error")) throw std::runtime_error(resp["error"].get<std::string>());
            return resp["result"];
        }
        int n = conn_->recv(tmp, sizeof(tmp));
        if (n <= 0) throw std::runtime_error("agent closed the connection");
        buf_.append(tmp, static_cast<size_t>(n));
    }
}

}  // namespace ipc
