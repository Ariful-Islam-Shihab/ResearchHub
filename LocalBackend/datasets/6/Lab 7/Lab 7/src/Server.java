import java.io.IOException;
import java.io.ObjectOutputStream;
import java.net.ServerSocket;
import java.net.Socket;

public class Server {
    Server() throws IOException {
        ServerSocket ss = new ServerSocket(22222);
        System.out.println("Server is waiting....");

        Socket cs = ss.accept(); // Server accepts any incoming client
                                //request
        System.out.println("Server connected to client");

        ObjectOutputStream oos = new ObjectOutputStream(cs.getOutputStream());
        oos.writeObject("Hello world");

        cs.close();
    }

    public static void main(String[] args) throws IOException {
        Server s = new Server();
    }
}
