import java.io.IOException;
import java.io.ObjectInputStream;
import java.net.Socket;
import java.util.Scanner;

public class Client {
    Client() throws IOException, ClassNotFoundException {
        Socket s = new Socket("127.0.0.1",22222);

        ObjectInputStream ois = new ObjectInputStream(s.getInputStream());
        System.out.println(ois.readObject());

        s.close();
    }

    public static void main(String[] args) throws IOException, ClassNotFoundException {
        Client c = new Client();
    }
}
