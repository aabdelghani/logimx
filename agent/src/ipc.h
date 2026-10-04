// JSON-lines RPC between the agent and its clients, plus event broadcast to connected clients.
// The stream is a Unix socket on Linux and macOS and a named pipe on Windows (ipc_posix.cpp,
// ipc_win.cpp); the protocol on top is the same everywhere.
#pragma once
#include <atomic>
#include <condition_variable>
#include <functional>
#include <memory>
#include <mutex>
#include <set>
#include <string>
#include <thread>
#include <vector>

#include "nlohmann/json.hpp"

namespace ipc {

using json = nlohmann::json;

std::string defaultSocketPath();

// One connected stream.
class Conn {
  public:
    virtual ~Conn() = default;
    virtual int recv(char* buf, size_t len) = 0;   // bytes read, <= 0 once closed
    virtual bool send(const std::string& s) = 0;   // whole string; safe from several threads
    virtual void close() = 0;                      // unblocks a pending recv
};

class Listener {
  public:
    static std::unique_ptr<Listener> create(const std::string& path);   // throws if taken
    virtual ~Listener() = default;
    virtual std::shared_ptr<Conn> accept(int timeoutMs) = 0;             // nullptr on timeout
};

std::shared_ptr<Conn> connect(const std::string& path);   // throws when the agent is not running

class Server {
  public:
    using Handler = std::function<json(const std::string& method, const json& params)>;
    Server(Handler h, std::string path = defaultSocketPath());
    ~Server();
    void broadcast(const std::string& event, const json& data);

  private:
    void acceptLoop();
    void serve(std::shared_ptr<Conn> c);
    Handler handler_;
    std::string path_;
    std::unique_ptr<Listener> listener_;
    std::atomic<bool> stop_{false};
    std::thread thread_;
    std::mutex clientsMutex_;
    std::condition_variable served_;   // signalled as each serve thread finishes
    int serving_ = 0;                  // serve threads still running, under clientsMutex_
    std::set<std::shared_ptr<Conn>> clients_;
};

class Client {
  public:
    explicit Client(std::string path = defaultSocketPath());
    json call(const std::string& method, const json& params = json::object());

  private:
    std::shared_ptr<Conn> conn_;
    int id_ = 0;
    std::string buf_;
};

}  // namespace ipc
