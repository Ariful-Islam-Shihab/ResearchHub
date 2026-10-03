import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.Statement;

public class UpdateDB {
    public static void main(String[] args) {
        try {
            Connection conn = DriverManager.getConnection("jdbc:mysql://localhost:3306/researchhub_db", "root", "");
            Statement stmt = conn.createStatement();
            stmt.executeUpdate("ALTER TABLE users ADD COLUMN local_sync_path VARCHAR(1024);");
            System.out.println("Success");
        } catch (Exception e) {
            e.printStackTrace();
        }
    }
}
